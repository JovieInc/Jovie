import { expect, it } from 'vitest';
import { githubReadFailure, readGithubJson } from '../github-json-read.mjs';
import { renderQueueRecovery } from '../merge-queue-recovery.mjs';
import { retainQueueCapabilityOutbox } from '../queue-capability-outbox.mjs';
import {
  at,
  issue,
  NOW,
  plan,
  repair,
  runtime,
  sha,
  snapshot,
  worker,
} from './fixtures/queue-recovery.mjs';

it('retains an accepted repair lease and blocks dispatch on required artifact transport', () => {
  const accepted = plan(null, { runtime: runtime([worker()]) });
  const next = plan(accepted.state, {
    runtime: null,
    capabilityBlockers: [
      {
        kind: 'artifact-transport',
        capability: 'repair-artifact-read',
        scope: 'JovieInc/Jovie',
        code: 'unavailable',
      },
    ],
  });
  expect(next.state.status).toBe('capability-blocked');
  expect(next.state.lease).toBe('worker-1');
  expect(next.state.capabilityRequests[0]).toMatchObject({
    status: 'pending',
    kind: 'artifact-transport',
  });
  expect(next.dispatch).toBe(false);
  expect(next.state.attempts).toBe(accepted.state.attempts);
});

it('keeps exact quota reset and source with a deferred observation', async () => {
  const source = 'https://api.github.com/repos/JovieInc/Jovie/actions/runs';
  const read = await readGithubJson(source, {
    token: 'fixture',
    apiUrl: 'https://api.github.com',
    fetchImpl: async url =>
      String(url).endsWith('/rate_limit')
        ? new Response(
            JSON.stringify({
              resources: { core: { remaining: 0, reset: 1794567600 } },
            })
          )
        : new Response('{}', { status: 403 }),
  });
  expect(githubReadFailure(read)).toMatchObject({
    deferred: true,
    capabilityBlocker: {
      kind: 'quota',
      resetAt: '2026-11-13T11:00:00.000Z',
      source,
    },
  });
});

it('canonical incident readback verifies request delivery without approving or dispatching', () => {
  const initial = plan(null, {
    capabilityBlockers: [
      { kind: 'tool', capability: 'repair-tool', scope: 'JovieInc/Jovie' },
    ],
  });
  const saved = retainQueueCapabilityOutbox(
    'red',
    initial.state,
    { ok: true },
    'red'
  );
  expect(saved.recovery.capabilityRequests[0].delivery).toMatchObject({
    attempts: 1,
    status: 'unknown',
  });
  const observed = plan(saved.recovery, {
    incident: {
      known: true,
      issue: { ...issue, description: renderQueueRecovery(initial.state) },
    },
  });
  expect(observed.state.capabilityRequests[0]).toMatchObject({
    status: 'pending',
    delivery: { status: 'confirmed', receipt: issue.identifier },
  });
  expect(observed.dispatch).toBe(false);
  expect(observed.writable).toBe(false);
});

it('unknown and denied delivery persist without blind replay', () => {
  const initial = plan(null, {
    capabilityBlockers: [
      {
        kind: 'credential',
        capability: 'existing-read-token',
        scope: 'JovieInc/Jovie',
      },
    ],
  });
  const failed = retainQueueCapabilityOutbox(
    'red',
    initial.state,
    { ok: false, reason: 'transport' },
    'red'
  );
  const retry = plan(failed.recovery);
  expect(retry.writable).toBe(false);
  expect(retry.state.capabilityRequests[0].delivery).toMatchObject({
    status: 'unknown',
    attempts: 1,
  });
  expect(
    plan(failed.recovery, {
      snapshot: snapshot({ open: [repair({ headRefOid: sha('f') })] }),
    }).writable
  ).toBe(false);
  const denied = retainQueueCapabilityOutbox(
    'red',
    initial.state,
    { ok: false, reason: 'linear_403' },
    'red'
  );
  expect(plan(denied.recovery).state.nextAction).toBe(
    'respect-request-delivery-denial'
  );
  expect(plan(denied.recovery).writable).toBe(false);
});

it('a moving head gets a new pending request; expired requests escalate without renewal', () => {
  const initial = plan(null, {
    capabilityBlockers: [
      {
        kind: 'custody-evidence',
        capability: 'gbrain-owner-receipt',
        scope: 'summer-484',
      },
    ],
  });
  const moved = plan(initial.state, {
    snapshot: snapshot({ open: [repair({ headRefOid: sha('f') })] }),
  });
  expect(moved.state.capabilityRequests).toHaveLength(2);
  expect(moved.state.capabilityRequests[0].status).toBe('superseded');
  expect(moved.state.capabilityRequests[1]).toMatchObject({
    status: 'pending',
    binding: { head: sha('f') },
  });
  const expired = plan(initial.state, {
    nowMs: NOW + 46 * 60000,
    snapshot: snapshot({ observedAt: at(46) }),
  });
  expect(expired.state.capabilityRequests[0].status).toBe('expired');
  expect(expired.state.nextAction).toBe('escalate-expired-capability-request');
  expect(expired.writable).toBe(false);
});

it('durable denial and retry history survive a stale local artifact and moving repair head', () => {
  const initial = plan(null, {
    capabilityBlockers: [
      { kind: 'tool', capability: 'repair-tool', scope: 'JovieInc/Jovie' },
    ],
  });
  const durable = structuredClone(initial.state);
  durable.capabilityRequests[0].status = 'denied';
  durable.capabilityRequests[0].delivery = {
    status: 'denied',
    attempts: 2,
    receipt: null,
  };
  const extra = {
    incident: {
      known: true,
      issue: { ...issue, description: renderQueueRecovery(durable) },
    },
  };
  const next = plan(initial.state, extra);
  expect(next.state.capabilityRequests[0]).toMatchObject({
    status: 'denied',
    delivery: { status: 'denied', attempts: 2 },
  });
  const moved = plan(initial.state, {
    ...extra,
    snapshot: snapshot({ open: [repair({ headRefOid: sha('f') })] }),
  });
  expect(moved.state.capabilityRequests).toHaveLength(1);
  expect(moved.writable).toBe(false);
  expect(moved.state.nextAction).toBe('respect-request-delivery-denial');
});

it('verified green persists green without charging delivery, and structured GraphQL denial cannot retry', () => {
  const initial = plan(null, {
    capabilityBlockers: [
      { kind: 'tool', capability: 'repair-tool', scope: 'JovieInc/Jovie' },
    ],
  });
  const closed = retainQueueCapabilityOutbox(
    'red',
    { ...initial.state, status: 'recovered' },
    { ok: true },
    'green'
  );
  expect(closed.status).toBe('green');
  expect(closed.recovery.capabilityRequests[0].delivery.attempts).toBe(0);
  const denied = retainQueueCapabilityOutbox(
    'red',
    initial.state,
    {
      ok: false,
      reason: 'linear_update_graphql_error',
      body: [{ extensions: { code: 'FORBIDDEN' } }],
    },
    'red'
  );
  expect(plan(denied.recovery).writable).toBe(false);
  expect(denied.recovery.capabilityRequests[0].delivery.status).toBe('denied');
});

it('a new blocker cannot retry a denied canonical destination', () => {
  const first = plan(null, {
    capabilityBlockers: [
      {
        kind: 'custody-evidence',
        capability: 'official-state',
        scope: 'worker',
      },
    ],
  });
  const denied = retainQueueCapabilityOutbox(
    'red',
    first.state,
    { ok: false, reason: 'linear_403' },
    'red'
  );
  const next = plan(denied.recovery, {
    capabilityBlockers: [
      { kind: 'tool', capability: 'pnpm', scope: 'executor' },
    ],
  });
  expect(next.state.capabilityRequests).toHaveLength(2);
  expect(next.writable).toBe(false);
  expect(next.dispatch).toBe(false);
});

it('the first blocked observation retains a freshly accepted worker lease', () => {
  const result = plan(null, {
    runtime: runtime([worker()]),
    capabilityBlockers: [
      {
        kind: 'artifact-transport',
        capability: 'repair-artifact',
        scope: 'JovieInc/Jovie',
      },
    ],
  });
  expect(result.state).toMatchObject({
    owner: issue.identifier,
    lease: 'worker-1',
    status: 'capability-blocked',
  });
  expect(result.dispatch).toBe(false);
});

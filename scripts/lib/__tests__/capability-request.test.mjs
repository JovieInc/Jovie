import { createHash, createPublicKey } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../packages/api-client/client.ts';
import {
  deliverCapabilityRequest,
  preflightRequiredCapabilities,
  reserveCapabilityResume,
} from '../capability-admission.mjs';
import {
  advanceCapabilityRequest,
  CAPABILITY_PROBE_SCHEMA,
  CAPABILITY_RESOLUTION_SCHEMA,
  capabilityBinding,
  classifyCapabilityFailure,
  createCapabilityRequest,
  renderCapabilityRequest,
} from '../capability-request.mjs';
import {
  capabilityAuthorities,
  nativeCapabilityTransition,
} from '../native-capability-adapter.mjs';
import {
  at,
  blocker,
  job,
  keys,
  now,
  receipt,
  request,
  resumed,
  store,
} from './fixtures/capability-request.mjs';

describe('native capability adapter', () => {
  it('does not treat a commissioning key as an access-decision authority', () => {
    const publicKey = keys.fixture.publicKey.export({
      type: 'spki',
      format: 'pem',
    });
    const fingerprint = createHash('sha256')
      .update(
        createPublicKey(publicKey).export({ type: 'spki', format: 'der' })
      )
      .digest('hex');
    const registry = { trustedAttestationKeyFingerprints: [fingerprint] };
    expect(capabilityAuthorities(registry, publicKey)).toEqual({});
    expect(
      capabilityAuthorities(
        {
          ...registry,
          capabilityResolutionAuthorities: [
            {
              keyId: fingerprint,
              actor: 'access-owner',
              owner: job.owner,
              schemas: [CAPABILITY_RESOLUTION_SCHEMA],
            },
          ],
        },
        publicKey
      )[fingerprint].schemas
    ).toEqual([CAPABILITY_RESOLUTION_SCHEMA]);
    expect(capabilityAuthorities(registry, 'invalid-public-key')).toEqual({});
  });

  it('uses the retained record for signed resume once without resetting artifacts or custody', async () => {
    const req = request();
    const { record } = store(req);
    const input = {
      op: 'checkpoint',
      record,
      job,
      nowMs: now + 2000,
      ...resumed(req),
    };
    const untrusted = await nativeCapabilityTransition(
      structuredClone(input),
      {}
    );
    expect(untrusted.result.allowed).toBe(false);
    const first = await nativeCapabilityTransition(input, keys);
    expect(first.result.allowed).toBe(true);
    expect(first.record.artifacts).toEqual(['artifact://repair/sha256']);
    expect(first.record.custody.lease).toBe('accepted-lease');
    const second = await nativeCapabilityTransition(
      { ...input, record: first.record },
      keys
    );
    expect(second.result).toMatchObject({
      allowed: false,
      reason: 'resume-already-reserved',
    });
  });
});

describe('typed source-bound capability requests', () => {
  it('distinguishes proxy denial, authentication, provider denial and ambiguous Forbidden', () => {
    expect(
      classifyCapabilityFailure({ ...blocker, proxyDenied: true }).kind
    ).toBe('network-route');
    expect(classifyCapabilityFailure({ ...blocker, status: 401 }).kind).toBe(
      'authentication'
    );
    expect(
      classifyCapabilityFailure({ ...blocker, providerDenied: true }).kind
    ).toBe('authorization');
    expect(request().kind).toBe('access-unclassified');
    expect(classifyCapabilityFailure({ code: 'assertion-failed' })).toBeNull();
  });
  it('requests the smallest missing capability and excludes raw secrets and response content', () => {
    const req = request({
      ...blocker,
      raw: 'private-value',
      headers: { Authorization: 'secret' },
    });
    const rendered = JSON.stringify(req) + renderCapabilityRequest(req);
    expect(rendered).not.toMatch(
      /never-copy|private-value|Authorization|secret"/
    );
    expect(req).toMatchObject({
      binding: {
        jobId: job.id,
        head: job.head,
        action: job.action,
        capability: 'github-graphql',
        scope: 'JovieInc/Jovie',
      },
      status: 'pending',
      delivery: { status: 'pending' },
    });
    expect(request().id).toBe(req.id);
    expect(
      createCapabilityRequest(
        { ...job, head: 'b'.repeat(40) },
        blocker,
        now,
        at(3600)
      ).id
    ).not.toBe(req.id);
  });
  it('preflights missing tools, executor features, custody and artifacts before expensive dispatch', async () => {
    const requirements = [
      'tool',
      'executor-feature',
      'custody-evidence',
      'artifact-transport',
      'credential',
    ].map(kind => ({ kind, capability: kind, scope: job.id }));
    const result = await preflightRequiredCapabilities({
      job,
      requirements,
      nowMs: now,
      expiresAt: at(3600),
      probe: async requirement => requirement,
    });
    expect(result.ready).toBe(false);
    expect(result.requests.map(row => row.kind)).toEqual(
      requirements.map(row => row.kind)
    );
    expect(
      result.requests.every(row => row.owner === job.owner && row.action)
    ).toBe(true);
  });
  it('ignores stale or other-executor capability availability, but admits a fresh exact probe', async () => {
    const requirement = { kind: 'tool', capability: 'pnpm', scope: job.id };
    const run = observation =>
      preflightRequiredCapabilities({
        job,
        requirements: [requirement],
        nowMs: now,
        expiresAt: at(3600),
        probe: async () => observation,
      });
    const available = {
      available: true,
      binding: capabilityBinding(job, classifyCapabilityFailure(requirement)),
      observedAt: at(0),
    };
    expect(
      (
        await run({
          ...available,
          binding: { ...available.binding, head: 'b'.repeat(40) },
        })
      ).ready
    ).toBe(false);
    expect((await run({ ...available, observedAt: at(-300) })).ready).toBe(
      false
    );
    expect(
      (
        await run({
          ...available,
          binding: { ...available.binding, capability: 'wrong-tool' },
        })
      ).ready
    ).toBe(false);
    expect(
      (
        await run({
          ...available,
          binding: { ...available.binding, scope: 'wrong-scope' },
        })
      ).ready
    ).toBe(false);
    expect((await run(available)).ready).toBe(true);
  });
  it('delivery alone never approves; expired/denied/unsigned resolutions never resume', () => {
    const req = request();
    req.delivery.status = 'confirmed';
    const advance = extra =>
      advanceCapabilityRequest(req, {
        job,
        nowMs: now + 2000,
        trustedKeys: keys,
        ...extra,
      });
    expect(advance({}).allowed).toBe(false);
    expect(
      advance({ resolution: { ...receipt(req), signature: 'forged' } }).allowed
    ).toBe(false);
    expect(
      advance({
        resolution: receipt(req, CAPABILITY_RESOLUTION_SCHEMA, {
          decision: 'denied',
        }),
      }).request.status
    ).toBe('denied');
    expect(advance({ nowMs: now + 3600000 }).request.status).toBe('expired');
    expect(
      advance({
        resolution: receipt(req),
        probe: receipt(req, CAPABILITY_PROBE_SCHEMA, { available: false }),
      }).allowed
    ).toBe(false);
  });
  it('requires re-probe after explicit resolution and requalification after source changes', () => {
    const req = request();
    const args = {
      job,
      nowMs: now + 2000,
      trustedKeys: keys,
      resolution: receipt(req),
    };
    expect(advanceCapabilityRequest(req, args).nextAction).toBe(
      'reprobe-required-capability'
    );
    expect(
      advanceCapabilityRequest(req, {
        ...args,
        probe: receipt(req, CAPABILITY_PROBE_SCHEMA, { issuedAt: at(0) }),
      }).allowed
    ).toBe(false);
    expect(
      advanceCapabilityRequest(req, {
        ...args,
        probe: receipt(req, CAPABILITY_PROBE_SCHEMA, { issuedAt: at(2) }),
      }).allowed
    ).toBe(true);
    expect(
      advanceCapabilityRequest(req, {
        ...args,
        job: { ...job, head: 'b'.repeat(40) },
      }).request.status
    ).toBe('superseded');
  });
  it('quota requires the provider reset, an explicit resolution and a fresh source-bound probe', () => {
    const req = request({ ...blocker, kind: 'quota', resetAt: at(30) });
    const args = {
      job,
      nowMs: now + 2000,
      trustedKeys: keys,
      resolution: receipt(req),
      probe: receipt(req, CAPABILITY_PROBE_SCHEMA, { issuedAt: at(2) }),
    };
    expect(advanceCapabilityRequest(req, args).nextAction).toBe(
      'await-provider-reset'
    );
    expect(
      advanceCapabilityRequest(req, {
        ...args,
        nowMs: now + 31000,
        probe: receipt(req, CAPABILITY_PROBE_SCHEMA, { issuedAt: at(31) }),
      }).allowed
    ).toBe(true);
  });
});

describe('existing outbox and admission adapter contract', () => {
  it('verifies notification readback without granting approval; duplicates deliver once', async () => {
    const { record, transaction } = store();
    const req = record.capabilityRequests[0];
    const send = vi.fn(async () => ({ receipt: 'message-1' }));
    const args = {
      jobId: job.id,
      requestId: req.id,
      transaction,
      send,
      readback: async () => ({
        id: 'message-1',
        requestId: req.id,
        bindingDigest: req.id,
      }),
      nowMs: now,
    };
    await Promise.all([
      deliverCapabilityRequest(args),
      deliverCapabilityRequest(args),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(req.status).toBe('pending');
    expect(req.delivery.status).toBe('confirmed');
  });
  it('uncertain sends and disconnects only read back; never spam retry', async () => {
    const { record, transaction } = store();
    const req = record.capabilityRequests[0];
    const send = vi.fn(async () => {
      throw new Error('disconnected');
    });
    const args = {
      jobId: job.id,
      requestId: req.id,
      transaction,
      send,
      readback: async () => null,
      nowMs: now,
    };
    await deliverCapabilityRequest(args);
    await deliverCapabilityRequest(args);
    expect(send).toHaveBeenCalledTimes(1);
    expect(req.delivery.status).toBe('unknown');
    req.delivery.status = 'sending';
    req.delivery.startedAt = at(-301);
    await deliverCapabilityRequest(args);
    expect(send).toHaveBeenCalledTimes(1);
    expect(req.delivery.status).toBe('unknown');
  });
  it('preserves a denied notification and bounded failed delivery without claiming it reached the user', async () => {
    const { record, transaction } = store();
    const req = record.capabilityRequests[0];
    const send = vi.fn(async () => ({ status: 'denied' }));
    const args = {
      jobId: job.id,
      requestId: req.id,
      transaction,
      send,
      readback: async () => null,
      nowMs: now,
    };
    expect((await deliverCapabilityRequest(args)).delivered).toBe(false);
    await deliverCapabilityRequest(args);
    expect(send).toHaveBeenCalledTimes(1);
    expect(req.delivery.status).toBe('denied');
  });
  it('reserves the same job once under concurrent events and preserves custody/artifacts across disconnect', async () => {
    const { record, transaction } = store();
    const req = record.capabilityRequests[0];
    const results = await Promise.all([
      reserveCapabilityResume({ ...resumed(req), transaction }),
      reserveCapabilityResume({ ...resumed(req), transaction }),
    ]);
    expect(results.filter(row => row.allowed)).toHaveLength(1);
    expect(record.resume.jobId).toBe(job.id);
    expect(record.custody.lease).toBe('accepted-lease');
    expect(record.artifacts).toEqual(['artifact://repair/sha256']);
    expect(
      (await reserveCapabilityResume({ ...resumed(req), transaction })).reason
    ).toBe('resume-already-reserved');
  });
  it('missing accepted custody blocks only that job, even with approved access', async () => {
    const first = store();
    first.record.custody.accepted = false;
    expect(
      (
        await reserveCapabilityResume({
          ...resumed(first.record.capabilityRequests[0]),
          transaction: first.transaction,
        })
      ).reason
    ).toBe('accepted-custody-required');
    const other = store();
    expect(
      (
        await reserveCapabilityResume({
          ...resumed(other.record.capabilityRequests[0]),
          transaction: other.transaction,
        })
      ).allowed
    ).toBe(true);
  });
});

it('never resumes a running/completed job, a changed policy or expired custody', async () => {
  for (const outcome of ['running', 'completed', 'unknown']) {
    const { record, transaction } = store();
    record.execution.outcome = outcome;
    expect(
      (
        await reserveCapabilityResume({
          ...resumed(record.capabilityRequests[0]),
          transaction,
        })
      ).allowed
    ).toBe(false);
  }
  const changed = store();
  changed.record.job.policyRevision = 'new-policy';
  expect(
    (
      await reserveCapabilityResume({
        ...resumed(changed.record.capabilityRequests[0]),
        transaction: changed.transaction,
      })
    ).reason
  ).toBe('current-job-binding-unverified');
  const stale = store();
  stale.record.custody.expiresAt = at(1);
  expect(
    (
      await reserveCapabilityResume({
        ...resumed(stale.record.capabilityRequests[0]),
        transaction: stale.transaction,
      })
    ).reason
  ).toBe('accepted-custody-required');
});

it('late delivery completion cannot overwrite a newer confirmed readback', async () => {
  const { record, transaction } = store();
  const req = record.capabilityRequests[0];
  /** @type {((value?: unknown) => void) | undefined} */
  let release;
  let started;
  const entered = new Promise(resolve => {
    started = resolve;
  });
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const first = deliverCapabilityRequest({
    jobId: job.id,
    requestId: req.id,
    transaction,
    nowMs: now,
    send: async () => {
      started();
      await pending;
      return { status: 'unknown' };
    },
    readback: async () => null,
  });
  await entered;
  const second = await deliverCapabilityRequest({
    jobId: job.id,
    requestId: req.id,
    transaction,
    nowMs: now + 301000,
    send: async () => {
      throw new Error('must-not-resend');
    },
    readback: async () => ({
      id: 'confirmed-1',
      requestId: req.id,
      bindingDigest: req.id,
    }),
  });
  expect(second.delivered).toBe(true);
  if (!release) throw new Error('delivery-was-not-started');
  release();
  await first;
  expect(req.delivery.status).toBe('confirmed');
});

it('definite notification failures use the existing outbox deadline and stop after two attempts', async () => {
  const { record, transaction } = store();
  const req = record.capabilityRequests[0];
  const send = vi.fn(async () => ({
    status: 'not-sent',
    nextAttemptAt: at(10),
  }));
  const args = {
    jobId: job.id,
    requestId: req.id,
    transaction,
    send,
    readback: async () => null,
    nowMs: now,
  };
  await deliverCapabilityRequest(args);
  await deliverCapabilityRequest(args);
  expect(send).toHaveBeenCalledTimes(1);
  await deliverCapabilityRequest({
    ...args,
    nowMs: now + 11000,
    send: async () => ({ status: 'not-sent', nextAttemptAt: at(20) }),
  });
  expect(
    (await deliverCapabilityRequest({ ...args, nowMs: now + 21000 })).reason
  ).toBe('delivery-attempts-exhausted');
  expect(req.status).toBe('pending');
});

it('uses the shared API-client quota decision and exact reset without new retry work', async () => {
  const probe = vi.fn(async () => {
    throw new ApiError('budget', 'github', 'shared ledger held', {
      retryAt: now + 60000,
    });
  });
  const result = await preflightRequiredCapabilities({
    job,
    nowMs: now,
    expiresAt: at(3600),
    requirements: [
      {
        kind: 'network-route',
        capability: 'github-graphql',
        scope: 'JovieInc/Jovie',
        source: 'https://api.github.com/graphql',
      },
    ],
    probe,
  });
  expect(probe).toHaveBeenCalledTimes(1);
  expect(result.requests[0]).toMatchObject({
    kind: 'quota',
    deadline: at(60),
    evidence: { resetAt: at(60), source: 'https://api.github.com/graphql' },
  });
});

it('an API authentication failure is not relabeled as its required network capability', async () => {
  const result = await preflightRequiredCapabilities({
    job,
    nowMs: now,
    expiresAt: at(3600),
    requirements: [
      {
        kind: 'network-route',
        capability: 'github-graphql',
        scope: 'JovieInc/Jovie',
      },
    ],
    probe: async () => {
      throw new ApiError('exhausted', 'github', 'unauthenticated', {
        status: 401,
      });
    },
  });
  expect(result.ready).toBe(false);
  expect(result.requests[0].kind).toBe('authentication');
});

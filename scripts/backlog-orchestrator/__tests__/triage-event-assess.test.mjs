import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  assessTriageEvent as assessWithRealClient,
  escalationBlockOf,
  parseTriageEvent,
  assessTriageSweep as sweepWithRealClient,
} from '../triage-event-assess.mjs';

/** Partial clients are deliberate test doubles; production uses the full Linear module.
 * @param {any} event
 * @param {any} client
 * @param {any} summer
 * @returns {Promise<any>}
 */
function assessTriageEvent(event, client, summer) {
  return assessWithRealClient(event, client, summer);
}

/** @param {any} client @param {any} [summer] @param {any} [options] @returns {Promise<any>} */
function assessTriageSweep(client, summer, options) {
  return sweepWithRealClient(client, summer, options);
}

const ISSUE_ID = '68b3e8de-588e-46ba-8209-84329d154627';
const TRIAGE_ID = '9844cfe6-6cf4-4347-842c-893a68f349b8';
const summer = decision => async () => ({
  decision,
  schema: 'summer.linear-triage-assessment/v1',
  linearUpdatedAt: '2026-09-24T00:00:00.000Z',
  authorizesDispatch: false,
  acceptedInvestigation: false,
});

function event(overrides = {}) {
  return {
    action: 'linear_triage_assess',
    client_payload: {
      delivery_id: 'delivery-1234567890',
      issue_id: ISSUE_ID,
      issue_identifier: 'JOV-6500',
      team_key: 'JOV',
      state_name: 'Triage',
      action: 'create',
      ...overrides,
    },
  };
}

function issue(overrides = {}) {
  return {
    id: ISSUE_ID,
    identifier: 'JOV-6500',
    title: 'Fix bounded issue',
    description: '## Scope\nFix the issue.\n## Acceptance\nVerified behavior.',
    updatedAt: '2026-09-24T00:00:00.000Z',
    priority: 2,
    assignee: null,
    state: { id: TRIAGE_ID, name: 'Triage', type: 'triage' },
    labels: { nodes: [] },
    comments: { nodes: [] },
    relations: { nodes: [] },
    children: { nodes: [] },
    ...overrides,
  };
}

function jev(overrides = {}) {
  return {
    schema: 'summer.jev-triage/v1',
    model: 'typesafe-ai/jev',
    status: 'decided',
    destination: 'Todo',
    priority: 2,
    category: 'bug',
    confidence: 0.98,
    reason: 'bounded regression repair',
    assessmentKey: 'assessment-1',
    ...overrides,
  };
}

function jevWorld(overrides = {}) {
  let current = issue(overrides);
  const writes = [];
  const client = {
    fetchIssue: async () => structuredClone(current),
    fetchTeamLabel: async () => ({ id: 'ready-id', name: 'agent-ready' }),
    addComment: async (_id, body) => {
      current.comments.nodes.push({ body });
      writes.push('comment');
      return { success: true };
    },
    updateIssue: async (_id, input) => {
      current = {
        ...current,
        state: {
          id: input.stateId,
          type: 'unstarted',
          name:
            input.stateId === 'c6c00506-dc9f-4910-8ff7-3874dd77174c'
              ? 'Todo'
              : 'Backlog',
        },
        priority: input.priority,
        labels: {
          nodes: input.labelIds?.map(id => ({ id })) ?? current.labels.nodes,
        },
      };
      writes.push('update');
      return { success: true };
    },
  };
  return {
    client,
    writes,
    receipt: assessment => async () => ({
      ...(await summer('existing-intake-reconcile')()),
      assessment,
    }),
  };
}

test('applies Jev Todo with priority and preserved labels, verifies readback, then wakes existing admission', async () => {
  const world = jevWorld({
    labels: { nodes: [{ id: 'existing-id', name: 'bug' }] },
  });
  const result = await assessTriageEvent(
    event(),
    world.client,
    world.receipt(jev())
  );
  assert.equal(result.disposition, 'Todo');
  assert.equal(result.verified.state, 'Todo');
  assert.equal(result.wakeSymphony, true);
  assert.deepEqual(
    (await world.client.fetchIssue()).labels.nodes.map(row => row.id),
    ['existing-id', 'ready-id']
  );
  const replay = await assessTriageEvent(
    event(),
    world.client,
    world.receipt(jev())
  );
  assert.equal(replay.disposition, 'stale-event');
  assert.deepEqual(world.writes, ['comment', 'update']);
});

test('sorts Jev Backlog and incomplete Todo without creating an implementation lease', async () => {
  for (const [overrides, assessment, destination] of [
    [{}, jev({ destination: 'Backlog', priority: 4 }), 'Backlog'],
    [{ description: 'not scoped' }, jev(), 'Todo'],
  ]) {
    const world = jevWorld(overrides);
    const result = await assessTriageEvent(
      event(),
      world.client,
      world.receipt(assessment)
    );
    assert.equal(result.disposition, destination);
    assert.equal(result.wakeSymphony, false);
    assert.equal((await world.client.fetchIssue()).labels.nodes.length, 0);
  }
});

test('holds ambiguity, interrupted provider work, urgent downgrade and actual owners without writes', async () => {
  for (const [overrides, assessment] of [
    [{}, jev({ status: 'ambiguous', destination: null, priority: null })],
    [{}, jev({ status: 'unavailable', destination: null, priority: null })],
    [{ priority: 1 }, jev()],
    [{ assignee: { id: 'owner', name: 'Live writer' } }, jev()],
  ]) {
    const world = jevWorld(overrides);
    const result = await assessTriageEvent(
      event(),
      world.client,
      world.receipt(assessment)
    );
    assert.equal(result.wakeSymphony, false);
    assert.equal(result.mutations, 0);
    assert.deepEqual(world.writes, []);
  }
});

test('fails closed on invalid Jev response, missing readiness label and ownership race', async () => {
  const invalid = jevWorld();
  await assert.rejects(
    assessTriageEvent(
      event(),
      invalid.client,
      invalid.receipt(jev({ destination: 'Done' }))
    ),
    /invalid-jev/
  );
  const missing = jevWorld();
  missing.client.fetchTeamLabel = async () => null;
  await assert.rejects(
    assessTriageEvent(event(), missing.client, missing.receipt(jev())),
    /label-unavailable/
  );
  const raced = jevWorld();
  const original = raced.client.fetchIssue;
  let reads = 0;
  raced.client.fetchIssue = async () => {
    const snapshot = await original();
    if (++reads >= 3)
      snapshot.assignee = { id: 'new-owner', name: 'Live writer' };
    return snapshot;
  };
  await assert.rejects(
    assessTriageEvent(event(), raced.client, raced.receipt(jev())),
    /ownership-changed/
  );
  assert.deepEqual(raced.writes, []);
});

test('requires authoritative mutation, comment and disposition readback before waking', async () => {
  for (const failure of ['comment', 'mutation', 'readback']) {
    const world = jevWorld();
    if (failure === 'comment')
      world.client.addComment = async () => ({ success: false });
    else
      world.client.updateIssue = async () => ({
        success: failure !== 'mutation',
      });
    await assert.rejects(
      assessTriageEvent(event(), world.client, world.receipt(jev())),
      /jev-triage-(comment|mutation|readback)-failed/
    );
  }
});

test('catch-up recovers missed deliveries oldest first and preserves partial failures', async () => {
  const first = issue({ updatedAt: '2026-09-23T00:00:00.000Z' });
  const second = issue({ identifier: 'JOV-6501' });
  const calls = [];
  const receipt = await assessTriageSweep(
    {
      fetchTeamTriageIssues: async () => [second, first],
      fetchIssue: async id => (id === first.identifier ? first : second),
    },
    async delivery => {
      calls.push(delivery.identifier);
      if (delivery.identifier === first.identifier)
        throw new Error('provider-unavailable');
      return { decision: 'urgent-investigation-required' };
    }
  );
  assert.deepEqual(calls, ['JOV-6500', 'JOV-6501']);
  assert.equal(receipt.failed, 1);
  assert.equal(receipt.assessed, 2);
  assert.equal(receipt.deferred, 0);
  assert.equal(receipt.wakeSymphony, false);
  assert.equal(receipt.results[0].error, 'provider-unavailable');
});

test('catch-up is bounded and reports deferred work rather than dropping it', async () => {
  const client = { fetchTeamTriageIssues: async () => [issue(), issue()] };
  const limited = await assessTriageSweep(client, undefined, { maxIssues: 0 });
  assert.equal(limited.assessed, 0);
  assert.equal(limited.deferred, 2);
  const expired = await assessTriageSweep(client, undefined, {
    now: (() => {
      let value = 0;
      return () => value++ * 60_000;
    })(),
  });
  assert.equal(expired.assessed, 0);
  assert.equal(expired.deferred, 2);
  await assert.rejects(
    assessTriageSweep({
      fetchTeamTriageIssues: async () => {
        throw new Error('inventory-unavailable');
      },
    }),
    /inventory-unavailable/
  );
});

test('the sweep CLI names failing and blocked rows instead of an anonymous exit', async () => {
  // The workflow step consumes the module's CLI (--sweep); the exit rule
  // keeps its full strength for every failure the sweep owns (failed > 0,
  // or a blocked row with no provider-blocked escalation), and each
  // failing/blocked/provider-blocked row is annotated by name.
  const source = readFileSync(
    new URL('../triage-event-assess.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /blockedWithoutEscalation > 0/);
  assert.match(source, /::error title=Triage assessment failed::/);
  assert.match(
    source,
    /::warning title=Urgent Triage investigation required::/
  );
  assert.match(source, /::warning title=Triage escalation provider-blocked::/);
});

test('a Summer provider-blocked escalation is named and counted without failing the sweep', async () => {
  const blocked = issue({ identifier: 'JOV-8015', priority: 1 });
  const urgent = issue({ identifier: 'JOV-6500', priority: 1 });
  const escalated = {
    ...(await summer('existing-intake-reconcile')()),
    escalation: {
      status: 'provider-block',
      code: 'reason-lane-model-capacity-cost-binding-unverified',
      requestedModel: 'openai/gpt-6.1-sol',
      owner: 'Gem reason lane',
    },
  };
  const receipt = await assessTriageSweep(
    {
      fetchTeamTriageIssues: async () => [blocked, urgent],
      fetchIssue: async id => (id === blocked.identifier ? blocked : urgent),
    },
    async delivery =>
      delivery.identifier === blocked.identifier
        ? escalated
        : summer('urgent-investigation-required')()
  );
  assert.equal(receipt.providerBlocked, 1);
  assert.equal(receipt.blocked, 1);
  assert.equal(receipt.failed, 0);
  const escalatedRow = receipt.results.find(
    result => result.issue === 'JOV-8015'
  );
  assert.equal(escalatedRow.escalation.status, 'provider-block');
  assert.equal(
    escalatedRow.escalation.code,
    'reason-lane-model-capacity-cost-binding-unverified'
  );

  assert.equal(escalationBlockOf(escalated).code, escalated.escalation.code);
  assert.equal(
    escalationBlockOf(await summer('urgent-investigation-required')()),
    null
  );
  assert.equal(escalationBlockOf(null), null);
  assert.equal(
    escalationBlockOf({
      escalation: { status: 'provider-unavailable', code: 'other' },
    }),
    null
  );
});

test('rejects untrusted or malformed repository dispatch before Linear access', () => {
  assert.throws(
    () => parseTriageEvent(event({ issue_identifier: 'LYB-12' })),
    /invalid-linear-triage-event/
  );
  assert.throws(
    () => parseTriageEvent(event({ issue_id: 'not-a-uuid' })),
    /invalid-linear-triage-event/
  );
  assert.throws(
    () => parseTriageEvent({ ...event(), action: 'other' }),
    /invalid-linear-triage-event/
  );
});

test('fails closed when the current Linear identity differs from the event', async () => {
  const client = { fetchIssue: async () => issue({ id: 'another-id' }) };
  await assert.rejects(
    assessTriageEvent(event(), client, summer('existing-intake-reconcile')),
    /linear-triage-identity-mismatch/
  );
});

test('does not mutate an issue that left Triage before the job ran', async () => {
  let writes = 0;
  const client = {
    fetchIssue: async () => issue({ state: { id: 'todo-id', name: 'Todo' } }),
    addComment: async () => {
      writes += 1;
    },
  };
  const receipt = await assessTriageEvent(
    event(),
    client,
    summer('existing-intake-reconcile')
  );
  assert.equal(receipt.disposition, 'stale-event');
  assert.equal(receipt.wakeSymphony, false);
  assert.equal(writes, 0);
});

test('records an urgent unowned assessment without waking Symphony', async () => {
  let comments = 0;
  const snapshot = issue({ priority: 1, title: 'P0 measurement blocker' });
  const client = {
    fetchIssue: async () => snapshot,
    addComment: async () => {
      comments += 1;
      return { success: true };
    },
    transitionIssue: async () => {
      throw new Error('unexpected transition');
    },
  };
  const receipt = await assessTriageEvent(
    event(),
    client,
    summer('urgent-investigation-required')
  );
  assert.equal(receipt.issue, 'JOV-6500');
  assert.equal(receipt.requiresImmediateInvestigation, true);
  assert.equal(receipt.wakeSymphony, false);
  assert.equal(comments, 0);
});

test('founder steering assignment alone is not an investigation acknowledgement', async () => {
  const snapshot = issue({
    priority: 1,
    assignee: { id: 'bb142ab2-e0e9-4f89-b330-b484d6b32139', name: 'Tim White' },
  });
  const client = {
    fetchIssue: async () => snapshot,
    addComment: async () => ({ success: true }),
  };
  const receipt = await assessTriageEvent(
    event(),
    client,
    summer('urgent-investigation-required')
  );
  assert.equal(
    receipt.summerAssessment.decision,
    'urgent-investigation-required'
  );
  assert.equal(receipt.requiresImmediateInvestigation, true);
  assert.equal(receipt.wakeSymphony, false);
});

test('moves only a fresh agent-ready issue through the existing reconciler', async () => {
  let transitions = 0;
  const snapshot = issue({
    labels: { nodes: [{ id: 'label-1', name: 'agent-ready' }] },
  });
  const client = {
    fetchIssue: async () => snapshot,
    addComment: async () => ({ success: true }),
    transitionIssue: async () => {
      transitions += 1;
      return { success: true };
    },
  };
  const receipt = await assessTriageEvent(
    event(),
    client,
    summer('existing-intake-reconcile')
  );
  assert.equal(receipt.wakeSymphony, true);
  assert.equal(receipt.reconciliation.route, 'agent-ready-lane');
  assert.equal(transitions, 1);
});

test('fails closed before reconciliation if Summer assessment is unavailable', async () => {
  let writes = 0;
  const client = {
    fetchIssue: async () => issue(),
    addComment: async () => {
      writes += 1;
    },
  };
  await assert.rejects(
    assessTriageEvent(event(), client, async () => {
      throw new Error('summer-unavailable');
    }),
    /summer-unavailable/
  );
  assert.equal(writes, 0);
});

test('rejects a changed issue after Summer assessed the prior revision', async () => {
  let reads = 0;
  let writes = 0;
  const client = {
    fetchIssue: async () => {
      reads += 1;
      return issue({
        updatedAt:
          reads === 1 ? '2026-09-24T00:00:00.000Z' : '2026-09-24T00:01:00.000Z',
      });
    },
    addComment: async () => {
      writes += 1;
    },
  };
  await assert.rejects(
    assessTriageEvent(event(), client, summer('existing-intake-reconcile')),
    /changed-after-summer/
  );
  assert.equal(writes, 0);
});

test('preserves founder steering eligibility through canonical Jovie ownership policy', async () => {
  let transitions = 0;
  const snapshot = issue({
    assignee: { id: 'bb142ab2-e0e9-4f89-b330-b484d6b32139', name: 'Tim White' },
    labels: { nodes: [{ id: 'label-1', name: 'agent-ready' }] },
  });
  const client = {
    fetchIssue: async () => snapshot,
    addComment: async () => ({ success: true }),
    transitionIssue: async () => {
      transitions += 1;
      return { success: true };
    },
  };
  const receipt = await assessTriageEvent(
    event(),
    client,
    summer('existing-intake-reconcile')
  );
  assert.equal(receipt.wakeSymphony, true);
  assert.equal(transitions, 1);
});

test('holds an actual assigned owner under canonical Jovie ownership policy', async () => {
  let writes = 0;
  const snapshot = issue({
    assignee: { id: 'other-owner', name: 'Another Owner' },
    labels: { nodes: [{ id: 'label-1', name: 'agent-ready' }] },
  });
  const client = {
    fetchIssue: async () => snapshot,
    addComment: async () => {
      writes += 1;
      return { success: true };
    },
    transitionIssue: async () => {
      writes += 1;
      return { success: true };
    },
  };
  const receipt = await assessTriageEvent(
    event(),
    client,
    summer('existing-intake-reconcile')
  );
  assert.equal(receipt.wakeSymphony, false);
  assert.equal(receipt.disposition, 'owned-active');
  assert.equal(writes, 0);
});

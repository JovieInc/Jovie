import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assessTriageEvent,
  parseTriageEvent,
} from '../triage-event-assess.mjs';

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
    state: { id: TRIAGE_ID, name: 'Triage', type: 'triage' },
    labels: { nodes: [] },
    comments: { nodes: [] },
    relations: { nodes: [] },
    children: { nodes: [] },
    ...overrides,
  };
}

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

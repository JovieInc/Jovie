// JOV-13101 team drift guardrail — offline contract tests for
// scripts/linear-team-drift.mjs. The evaluator is pure; network paths are
// exercised through injected fetch implementations only. Wired into CI via
// SCRIPT_CONTRACT_NODE_TESTS (scripts/ci-fast-lanes.mjs).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ENROLLED_TEAM_KEYS,
  evaluateTeamDrift,
  GIT_AUTOMATION_FORBIDDEN_STATES,
  GIT_AUTOMATION_STATE_POLICY,
  LINEAR_TEAM_DRIFT_QUERY,
  LINEAR_TEAM_POLICY_SCHEMA,
  normalizeTeams,
  REQUIRED_STATUS_NAMES,
  SHARED_WORKFLOW_STATUSES,
} from './lib/linear-team-policy.mjs';
import { runTeamDrift } from './linear-team-drift.mjs';

/**
 * @typedef {import('./lib/linear-team-policy.mjs').TeamSnapshot} TeamSnapshot
 * @typedef {{name: string, type: string}} StatusFixture
 * @typedef {{event: string, state: string | null, targetBranch: string | null,
 *   archivedAt: string | null}} AutomationFixture
 */

// Report-only proof: every module this check ships performs no Linear
// mutation, so drift can never be silently patched away.
const scriptSources = [
  readFileSync(
    fileURLToPath(new URL('./linear-team-drift.mjs', import.meta.url)),
    'utf8'
  ),
  readFileSync(
    fileURLToPath(new URL('./lib/linear-team-policy.mjs', import.meta.url)),
    'utf8'
  ),
].join('\n');

/** Shared-set entries as a live Linear team snapshot carries them. */
const sharedStatuses = Object.entries(SHARED_WORKFLOW_STATUSES).map(
  ([name, type]) => ({ name, type })
);

/** The policy-conformant default-scope automation set. */
const policyAutomations = [
  {
    event: 'start',
    state: 'In Progress',
    targetBranch: null,
    archivedAt: null,
  },
  { event: 'review', state: 'In Review', targetBranch: null, archivedAt: null },
  { event: 'merge', state: 'Merging', targetBranch: null, archivedAt: null },
];

/**
 * @param {string} key
 * @param {{
 *   statuses?: StatusFixture[],
 *   automations?: AutomationFixture[],
 *   truncated?: boolean,
 * }} [overrides]
 * @returns {TeamSnapshot}
 */
function teamSnapshot(key, overrides = {}) {
  return {
    key,
    name: `Team ${key}`,
    statuses: overrides.statuses ?? sharedStatuses,
    gitAutomations: overrides.automations ?? policyAutomations,
    truncated: overrides.truncated ?? false,
  };
}

test('the pinned policy matches the JOV-13101 dispatch', () => {
  assert.deepEqual(ENROLLED_TEAM_KEYS, ['JOV', 'LYB', 'SYM']);
  assert.deepEqual(REQUIRED_STATUS_NAMES, [
    'Merging',
    'Validating',
    'Rework',
    'Done',
  ]);
  assert.deepEqual(SHARED_WORKFLOW_STATUSES, {
    Backlog: 'backlog',
    Canceled: 'canceled',
    Done: 'completed',
    Duplicate: 'duplicate',
    'In Progress': 'started',
    'In Review': 'started',
    Merging: 'started',
    Rework: 'started',
    Triage: 'triage',
    Todo: 'unstarted',
    Validating: 'started',
  });
  for (const name of REQUIRED_STATUS_NAMES)
    assert.ok(name in SHARED_WORKFLOW_STATUSES);
  assert.deepEqual(GIT_AUTOMATION_STATE_POLICY, {
    start: 'In Progress',
    review: 'In Review',
    merge: 'Merging',
  });
  assert.deepEqual(GIT_AUTOMATION_FORBIDDEN_STATES, { merge: ['Done'] });
  assert.equal(LINEAR_TEAM_POLICY_SCHEMA, 'jovie-linear-team-policy/v1');
});

test('simulation 1: a team matching the policy reports no findings', () => {
  assert.deepEqual(
    evaluateTeamDrift([
      teamSnapshot('JOV'),
      teamSnapshot('LYB'),
      teamSnapshot('SYM'),
    ]),
    []
  );
});

test('simulation 2: missing Rework and merge -> Done are reported, never patched', () => {
  const lyb = teamSnapshot('LYB', {
    statuses: sharedStatuses.filter(status => status.name !== 'Rework'),
    automations: [
      policyAutomations[0],
      policyAutomations[1],
      {
        event: 'merge',
        state: 'Done',
        targetBranch: null,
        archivedAt: null,
      },
    ],
  });
  const pristine = structuredClone(lyb);
  const findings = evaluateTeamDrift([teamSnapshot('JOV'), lyb]);
  const keys = findings.map(finding => `${finding.team}:${finding.key}`);
  assert.ok(keys.includes('LYB:missing-status'));
  assert.ok(keys.includes('LYB:git-automation-forbidden'));
  assert.equal(
    findings.find(finding => finding.key === 'missing-status').severity,
    'fail'
  );
  assert.equal(
    findings.find(finding => finding.key === 'git-automation-forbidden')
      .severity,
    'fail'
  );
  // Report-only: the snapshot the evaluator read is untouched.
  assert.deepEqual(lyb, pristine);
});

test('a wrong automation mapping fails and a missing rule warns', () => {
  const findings = evaluateTeamDrift([
    teamSnapshot('JOV', {
      automations: [
        { event: 'start', state: 'Todo', targetBranch: null, archivedAt: null },
        {
          event: 'merge',
          state: 'Merging',
          targetBranch: null,
          archivedAt: null,
        },
      ],
    }),
    teamSnapshot('LYB'),
    teamSnapshot('SYM'),
  ]);
  const start = findings.find(
    finding => finding.key === 'git-automation-mismatch'
  );
  assert.equal(start.severity, 'fail');
  assert.match(start.detail, /"start" maps to "Todo"/);
  const review = findings.find(
    finding => finding.key === 'git-automation-missing'
  );
  assert.equal(review.severity, 'warn');
});

test('extra statuses warn; type mismatches fail; truncation warns', () => {
  const sym = teamSnapshot('SYM', {
    statuses: [
      ...sharedStatuses.map(status =>
        status.name === 'Merging' ? { ...status, type: 'unstarted' } : status
      ),
      { name: 'Human Review', type: 'started' },
    ],
    truncated: true,
  });
  const findings = evaluateTeamDrift([
    teamSnapshot('JOV'),
    teamSnapshot('LYB'),
    sym,
  ]);
  assert.equal(
    findings.find(finding => finding.key === 'extra-status')?.severity,
    'warn'
  );
  assert.equal(
    findings.find(finding => finding.key === 'status-type-mismatch')?.severity,
    'fail'
  );
  assert.equal(
    findings.find(finding => finding.key === 'pagination-truncated')?.severity,
    'warn'
  );
});

test('simulation 3: an unenrolled team is drift with a write block', () => {
  const findings = evaluateTeamDrift([
    teamSnapshot('JOV'),
    teamSnapshot('LYB'),
    teamSnapshot('SYM'),
    teamSnapshot('NEW', {
      statuses: [
        { name: 'Todo', type: 'unstarted' },
        { name: 'In Progress', type: 'started' },
        { name: 'Done', type: 'completed' },
      ],
    }),
  ]);
  const unenrolled = findings.find(
    finding => finding.key === 'unenrolled-team'
  );
  assert.equal(unenrolled.severity, 'fail');
  assert.equal(unenrolled.writeBlock, true);
  assert.match(unenrolled.detail, /not enrolled/);
});

test('an enrolled team absent from Linear is drift', () => {
  const findings = evaluateTeamDrift([teamSnapshot('JOV')]);
  const keys = findings.map(finding => `${finding.team}:${finding.key}`);
  assert.deepEqual(keys.sort(), [
    'LYB:missing-enrolled-team',
    'SYM:missing-enrolled-team',
  ]);
});

test('archived automation rules are ignored', () => {
  const findings = evaluateTeamDrift([
    teamSnapshot('JOV', {
      automations: [
        ...policyAutomations,
        {
          event: 'merge',
          state: 'Done',
          targetBranch: 'legacy',
          archivedAt: '2026-11-01T00:00:00.000Z',
        },
      ],
    }),
    teamSnapshot('LYB'),
    teamSnapshot('SYM'),
  ]);
  assert.deepEqual(findings, []);
});

test('simulation 4: a Linear outage fails open and fabricates nothing', async () => {
  const missingKey = await runTeamDrift({ apiKey: '', nowMs: 1_000 });
  assert.equal(missingKey.receipt.mode, 'outage');
  assert.equal(missingKey.receipt.findings.length, 0);
  assert.equal(missingKey.exitCode, 0);

  const transport = await runTeamDrift({
    apiKey: 'lin_api_fixture',
    nowMs: 1_000,
    fetchImpl: async () => {
      throw new Error('socket hang up');
    },
  });
  assert.equal(transport.receipt.mode, 'outage');
  assert.equal(transport.receipt.findings.length, 0);
  assert.equal(transport.exitCode, 0);
  assert.equal(transport.receipt.outageReason, 'linear_team_drift_transport');
});

test('a live success path builds a receipt from the snapshot', async () => {
  const lyb = {
    key: 'LYB',
    name: 'LYB',
    states: {
      pageInfo: { hasNextPage: false },
      nodes: sharedStatuses.map(status => ({
        name: status.name,
        type: status.type,
      })),
    },
    gitAutomationStates: {
      pageInfo: { hasNextPage: false },
      nodes: [
        {
          event: 'start',
          state: { name: 'In Progress' },
          targetBranch: null,
          archivedAt: null,
        },
        {
          event: 'review',
          state: { name: 'In Review' },
          targetBranch: null,
          archivedAt: null,
        },
        {
          event: 'merge',
          state: { name: 'Done' },
          targetBranch: null,
          archivedAt: null,
        },
      ],
    },
  };
  const jov = {
    key: 'JOV',
    name: 'Jovie',
    states: {
      pageInfo: { hasNextPage: false },
      nodes: sharedStatuses.map(status => ({
        name: status.name,
        type: status.type,
      })),
    },
    gitAutomationStates: {
      pageInfo: { hasNextPage: false },
      nodes: [
        {
          event: 'start',
          state: { name: 'In Progress' },
          targetBranch: null,
          archivedAt: null,
        },
        {
          event: 'review',
          state: { name: 'In Review' },
          targetBranch: null,
          archivedAt: null,
        },
        {
          event: 'merge',
          state: { name: 'Merging' },
          targetBranch: null,
          archivedAt: null,
        },
      ],
    },
  };
  const body = JSON.stringify({
    data: { teams: { pageInfo: { hasNextPage: false }, nodes: [jov, lyb] } },
  });
  const { receipt, exitCode } = await runTeamDrift({
    apiKey: 'lin_api_fixture',
    nowMs: 1_000,
    fetchImpl: /** @type {typeof fetch} */ (
      /** @type {unknown} */ (
        async () => ({
          status: 200,
          ok: true,
          text: async () => body,
        })
      )
    ),
  });
  assert.equal(receipt.mode, 'drift');
  assert.equal(exitCode, 1);
  const lybTeam = receipt.teams.find(team => team.key === 'LYB');
  assert.equal(lybTeam.enrolled, true);
  assert.ok(
    receipt.findings.some(finding => finding.key === 'git-automation-forbidden')
  );
});

test('normalizeTeams rejects unknown shapes instead of guessing', () => {
  assert.equal(normalizeTeams(null), null);
  assert.equal(normalizeTeams({}), null);
  assert.equal(normalizeTeams({ teams: {} }), null);
  assert.equal(normalizeTeams({ teams: { nodes: [null] } }), null);
  const teams = normalizeTeams({
    teams: { pageInfo: { hasNextPage: false }, nodes: [] },
  });
  assert.deepEqual(teams, []);
});

test('the query pins the team-scoped git automation fields', () => {
  assert.ok(LINEAR_TEAM_DRIFT_QUERY.includes('gitAutomationStates'));
  assert.ok(LINEAR_TEAM_DRIFT_QUERY.includes('archivedAt'));
  assert.ok(LINEAR_TEAM_DRIFT_QUERY.includes('targetBranch'));
  assert.ok(LINEAR_TEAM_DRIFT_QUERY.includes('pageInfo { hasNextPage }'));
});

test('report-only: the check performs no Linear mutation', () => {
  for (const mutation of [
    'issueUpdate',
    'issueCreate',
    'issueLabel',
    'teamUpdate',
    'workflowState',
    'gitAutomationStateCreate',
    'gitAutomationStateUpdate',
    'gitAutomationStateDelete',
  ]) {
    assert.equal(scriptSources.includes(mutation), false, mutation);
  }
});

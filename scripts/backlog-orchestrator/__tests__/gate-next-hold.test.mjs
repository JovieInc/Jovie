import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CONTEXT_BLOCKER, issueContentHash } from '../context-gate.mjs';
import * as gateNextHold from '../gate-next-hold.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORCHESTRATOR_DIR = resolve(__dirname, '..');
const NOW = '2026-08-22T22:01:57.000Z';

function issue(identifier, overrides = {}) {
  return {
    id: `id-${identifier}`,
    identifier,
    title: overrides.title || 'Normalize one Sentry fingerprint',
    description: `## Problem
One deterministic alert fingerprint fans out.

## Proposed fix
Normalize the unstable token before sending the event.

## Acceptance criteria
* Repeated events group into one issue.
* Focused normalizer tests pass.`,
    createdAt: '2026-08-01T00:00:00.000Z',
    priority: overrides.priority ?? 2,
    estimate: 2,
    state: { name: 'Backlog' },
    project: { name: 'Infra & CI/CD', slugId: '82c6fbd42405' },
    assignee: null,
    labels: { nodes: [] },
    children: { nodes: [] },
    comments: { nodes: [] },
    ...overrides,
  };
}

function financeIssue() {
  return issue('JOV-4620', {
    title: 'Finance add private budgets sustainability targets and variance',
    priority: 1,
  });
}

function ordinaryIssue() {
  return issue('JOV-5291', {
    title: 'Normalize one Sentry fingerprint',
    priority: 3,
  });
}

const TARGETED_MISS = {
  status: 'blocked',
  stage: 'context',
  reason: CONTEXT_BLOCKER.NO_RESULTS,
  detail:
    'targeted context query returned no bindable pages: existing agent work and prior decisions related to finance budgets',
  mutations: 0,
};

const LEDGER_MISS = {
  status: 'blocked',
  stage: 'context',
  reason: CONTEXT_BLOCKER.NO_RESULTS,
  detail:
    'required coordination page returned no bindable page: coordination/agent-job-ledger',
  mutations: 0,
};

describe('issue-specific gate-next holds', () => {
  it('continues past a targeted context miss and admits the next verified issue', async () => {
    const persisted = [];
    const evaluated = [];
    const first = financeIssue();
    const next = ordinaryIssue();
    const result = await gateNextHold.admitNextFromPool({
      issues: [first, next],
      now: NOW,
      persistHolds: store => persisted.push(store),
      evaluateCandidate: async selected => {
        evaluated.push(selected.identifier);
        if (selected.identifier === 'JOV-4620') return { ...TARGETED_MISS };
        return {
          status: 'admitted',
          issue: selected.identifier,
          mutations: 'verified',
        };
      },
    });

    assert.equal(result.status, 'admitted');
    assert.equal(result.issue, 'JOV-5291');
    assert.equal(result.mutations, 'verified');
    assert.deepEqual(evaluated, ['JOV-4620', 'JOV-5291']);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].identifier, 'JOV-4620');
    assert.equal(result.skipped[0].reason, CONTEXT_BLOCKER.NO_RESULTS);
    assert.equal(persisted.length, 1);
    assert.equal(
      persisted[0].byIdentifier['JOV-4620'].issueHash,
      issueContentHash(first)
    );
  });

  it('continues past research-evidence-required and still admits at most one issue', async () => {
    const evaluated = [];
    const result = await gateNextHold.admitNextFromPool({
      issues: [financeIssue(), ordinaryIssue()],
      now: NOW,
      evaluateCandidate: async selected => {
        evaluated.push(selected.identifier);
        if (selected.identifier === 'JOV-4620') {
          return {
            status: 'blocked',
            stage: 'research',
            reason: 'research-evidence-required',
            mutations: 0,
          };
        }
        return {
          status: 'admitted',
          issue: selected.identifier,
          mutations: 'verified',
        };
      },
    });

    assert.equal(result.status, 'admitted');
    assert.equal(result.issue, 'JOV-5291');
    assert.deepEqual(evaluated, ['JOV-4620', 'JOV-5291']);
    assert.equal(result.skipped[0].reason, 'research-evidence-required');
  });

  it('reports a targeted --issue hold and does not steal another candidate', async () => {
    const evaluated = [];
    const persisted = [];
    const result = await gateNextHold.admitNextFromPool({
      issues: [financeIssue(), ordinaryIssue()],
      issueIdentifier: 'JOV-4620',
      now: NOW,
      persistHolds: store => persisted.push(store),
      evaluateCandidate: async selected => {
        evaluated.push(selected.identifier);
        return { ...TARGETED_MISS, issue: selected.identifier };
      },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.stage, 'context');
    assert.equal(result.issue, 'JOV-4620');
    assert.equal(result.reason, CONTEXT_BLOCKER.NO_RESULTS);
    assert.deepEqual(evaluated, ['JOV-4620']);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].identifier, 'JOV-4620');
    assert.equal(persisted.length, 1);
  });

  it('fails closed on gbrain-unavailable without trying later eligible issues', async () => {
    const evaluated = [];
    const result = await gateNextHold.admitNextFromPool({
      issues: [financeIssue(), ordinaryIssue()],
      now: NOW,
      evaluateCandidate: async selected => {
        evaluated.push(selected.identifier);
        return {
          status: 'blocked',
          stage: 'context',
          reason: CONTEXT_BLOCKER.GBRAIN_UNAVAILABLE,
          detail: 'operation=search;source=gbrain;error=ENOENT',
          mutations: 0,
        };
      },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, CONTEXT_BLOCKER.GBRAIN_UNAVAILABLE);
    assert.deepEqual(evaluated, ['JOV-4620']);
    assert.equal(result.skipped.length, 0);
  });

  it('fails closed on org-chart-missing and ownership-conflict', async () => {
    for (const reason of [
      CONTEXT_BLOCKER.ORG_CHART_MISSING,
      CONTEXT_BLOCKER.OWNERSHIP_CONFLICT,
    ]) {
      const evaluated = [];
      const result = await gateNextHold.admitNextFromPool({
        issues: [financeIssue(), ordinaryIssue()],
        now: NOW,
        evaluateCandidate: async selected => {
          evaluated.push(selected.identifier);
          return { status: 'blocked', stage: 'context', reason, mutations: 0 };
        },
      });
      assert.equal(result.reason, reason);
      assert.deepEqual(evaluated, ['JOV-4620']);
    }
  });

  it('fails closed when context-no-results is a missing coordination ledger', async () => {
    const evaluated = [];
    const result = await gateNextHold.admitNextFromPool({
      issues: [financeIssue(), ordinaryIssue()],
      now: NOW,
      evaluateCandidate: async selected => {
        evaluated.push(selected.identifier);
        return { ...LEDGER_MISS };
      },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, CONTEXT_BLOCKER.NO_RESULTS);
    assert.match(result.detail, /agent-job-ledger/);
    assert.deepEqual(evaluated, ['JOV-4620']);
  });

  it('excludes a fresh hash-bound hold from later pool events', async () => {
    const first = financeIssue();
    const holds = gateNextHold.recordIssueHold(
      { schema: gateNextHold.ISSUE_HOLD_SCHEMA, byIdentifier: {} },
      first,
      {
        reason: CONTEXT_BLOCKER.NO_RESULTS,
        detail: TARGETED_MISS.detail,
        now: NOW,
      }
    );
    const evaluated = [];
    const result = await gateNextHold.admitNextFromPool({
      issues: [first, ordinaryIssue()],
      now: NOW,
      holds,
      evaluateCandidate: async selected => {
        evaluated.push(selected.identifier);
        return {
          status: 'admitted',
          issue: selected.identifier,
          mutations: 'verified',
        };
      },
    });

    assert.equal(result.status, 'admitted');
    assert.equal(result.issue, 'JOV-5291');
    assert.deepEqual(evaluated, ['JOV-5291']);
  });

  it('retries after content changes or 24h elapses', async () => {
    const original = financeIssue();
    const hold = gateNextHold.recordIssueHold(
      { schema: gateNextHold.ISSUE_HOLD_SCHEMA, byIdentifier: {} },
      original,
      {
        reason: CONTEXT_BLOCKER.NO_RESULTS,
        detail: TARGETED_MISS.detail,
        now: NOW,
      }
    );

    assert.ok(gateNextHold.activeIssueHold(hold, original, { now: NOW }));
    assert.equal(
      gateNextHold.activeIssueHold(hold, original, {
        now: '2026-08-23T22:02:00.000Z',
      }),
      null
    );

    const edited = financeIssue();
    edited.description = `${edited.description}\n\nEdited scope.`;
    assert.notEqual(issueContentHash(edited), issueContentHash(original));
    assert.equal(
      gateNextHold.activeIssueHold(hold, edited, { now: NOW }),
      null
    );
  });

  it('does not persist holds during dry-run', async () => {
    const persisted = [];
    const result = await gateNextHold.admitNextFromPool({
      issues: [financeIssue(), ordinaryIssue()],
      now: NOW,
      isDryRun: true,
      persistHolds: store => persisted.push(store),
      evaluateCandidate: async selected => {
        if (selected.identifier === 'JOV-4620') return { ...TARGETED_MISS };
        return {
          status: 'would-admit',
          issue: selected.identifier,
          mutations: 0,
        };
      },
    });

    assert.equal(result.status, 'would-admit');
    assert.equal(result.issue, 'JOV-5291');
    assert.equal(result.mutations, 0);
    assert.deepEqual(persisted, []);
  });

  it('keeps hold files outside the orchestrator checkout', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jov-5292-holds-'));
    const filePath = join(dir, 'symphony-issue-holds.json');
    const resolved = gateNextHold.resolveIssueHoldFile({
      env: { JOVIE_ISSUE_HOLD_FILE: filePath },
      orchestratorDir: ORCHESTRATOR_DIR,
    });
    assert.equal(resolved, filePath);

    const first = financeIssue();
    const store = gateNextHold.recordIssueHold(
      { schema: gateNextHold.ISSUE_HOLD_SCHEMA, byIdentifier: {} },
      first,
      {
        reason: CONTEXT_BLOCKER.NO_RESULTS,
        detail: TARGETED_MISS.detail,
        now: NOW,
      }
    );
    gateNextHold.saveIssueHolds(filePath, store);
    const loaded = gateNextHold.loadIssueHolds(filePath);
    assert.equal(
      loaded.byIdentifier['JOV-4620'].issueHash,
      issueContentHash(first)
    );
    assert.match(readFileSync(filePath, 'utf8'), /symphony-issue-hold\/v1/);
  });
});

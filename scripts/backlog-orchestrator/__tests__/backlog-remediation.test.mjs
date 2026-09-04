import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertOfficialSymphonyFeed,
  buildRemediationReceipt,
  CAPACITY_SCHEMA,
  CLEAN_STREAK_REQUIRED,
  classifyRemediationCandidate,
  evaluateRuntimeCapacity,
  feedOfficialSymphony,
  findWorkpadComment,
  inventoryBacklog,
  OFFICIAL_SYMPHONY_REFRESH_URL,
  REMEDIATION_SCHEMA,
  upsertRemediationWorkpad,
  WORKPAD_HEADING,
  WORKPAD_PREFIX,
} from '../backlog-remediation.mjs';

const NOW = '2026-08-31T00:00:00.000Z';
const MAIN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MODULE = readFileSync(
  resolve(
    fileURLToPath(new URL('../backlog-remediation.mjs', import.meta.url))
  ),
  'utf8'
);
const ORCHESTRATOR = readFileSync(
  resolve(
    fileURLToPath(new URL('../backlog-orchestrator.mjs', import.meta.url))
  ),
  'utf8'
);

const SAFE_DESCRIPTION = `## Proposed fix
Repair one isolated controller edge in scripts/backlog-orchestrator/admission-gate.mjs.

## Optimization exception
- Class: non-product
- Justification: This control-plane fix ships no user-facing page, link, asset, campaign, recommendation, or content variant.

## Acceptance criteria
- Focused coverage passes.`;

function issue(identifier, overrides = {}) {
  return {
    id: `id-${identifier}`,
    identifier,
    title: overrides.title || 'Repair one controller edge',
    description: overrides.description || SAFE_DESCRIPTION,
    createdAt: overrides.createdAt || '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
    priority: 3,
    state: { name: overrides.state || 'Backlog' },
    assignee: overrides.assignee ?? null,
    labels: {
      nodes: (overrides.labels || []).map(name => ({ name })),
    },
    children: { nodes: overrides.children || [] },
    comments: { nodes: overrides.comments || [] },
    relations: { nodes: overrides.relations || [] },
    pullRequestUrl: overrides.pullRequestUrl ?? null,
    ...overrides,
  };
}

function healthySignals(overrides = {}) {
  return {
    schema: CAPACITY_SCHEMA,
    observedAt: NOW,
    workers: { running: 1, retrying: 0, maxConcurrent: 4 },
    host: {
      cpuSomeAvg10: 1,
      memoryFullAvg10: 0.1,
      ioFullAvg10: 0.2,
      availableMemoryBytes: 16 * 1024 ** 3,
    },
    provider: { accounts: 3, ready: 2 },
    cloneLatencyMs: 800,
    ci: { saturating: false, running: 2, queued: 0 },
    pullRequests: [],
    mergeQueue: { health: 'healthy', entries: 1 },
    ...overrides,
  };
}

function receiptFor(issues, options = {}) {
  return buildRemediationReceipt({
    issues,
    pullRequests: options.pullRequests || [],
    mainSha: options.mainSha || MAIN,
    capacitySignals: options.capacitySignals || healthySignals(),
    previousCleanStreak: options.previousCleanStreak ?? CLEAN_STREAK_REQUIRED,
    previousCohortSize: options.previousCohortSize ?? 1,
    now: NOW,
  });
}

describe('official Symphony backlog remediation', () => {
  it('inventories Linear issues against open and merged GitHub PRs', () => {
    const inventory = inventoryBacklog(
      [
        issue('JOV-10'),
        issue('JOV-11'),
        issue('JOV-11'),
        issue('JOV-12', {
          relations: [
            {
              type: 'duplicate',
              relatedIssue: { identifier: 'JOV-10' },
            },
          ],
        }),
      ],
      {
        now: NOW,
        mainSha: MAIN,
        pullRequests: [
          {
            number: 1,
            state: 'OPEN',
            title: 'fix JOV-10',
            headRefName: 'symphony/JOV-10-fix',
            mergeStateStatus: 'CLEAN',
          },
          {
            number: 2,
            state: 'MERGED',
            mergedAt: '2026-08-30T00:00:00.000Z',
            title: 'Fixes JOV-11',
            body: 'Fixes JOV-11',
          },
        ],
      }
    );
    assert.equal(inventory.scanned, 3);
    assert.deepEqual(
      inventory.rows.find(row => row.issue === 'JOV-10').openPullRequests,
      [1]
    );
    assert.deepEqual(
      inventory.rows.find(row => row.issue === 'JOV-11').mergedPullRequests,
      [2]
    );
    assert.equal(
      inventory.rows.find(row => row.issue === 'JOV-12').duplicateOf,
      'JOV-10'
    );
  });

  it('excludes taste, external messages, credentials, money, compliance, epics, and stale work', () => {
    /** @type {Array<[object, string]>} */
    const cases = [
      [
        issue('JOV-20', { title: 'Founder steering on brand voice' }),
        'human-taste-or-steering',
      ],
      [
        issue('JOV-21', { title: 'Send a Telegram outreach blast' }),
        'external-messages',
      ],
      [
        issue('JOV-22', { title: 'Rotate production credential' }),
        'credential-or-provisioning',
      ],
      [issue('JOV-23', { title: 'Change Stripe checkout pricing' }), 'money'],
      [
        issue('JOV-24', { title: 'Make a GDPR compliance decision' }),
        'compliance-or-security',
      ],
      [issue('JOV-25', { labels: ['type:epic'] }), 'broad-epic'],
      [
        issue('JOV-26', { createdAt: '2025-01-01T00:00:00.000Z' }),
        'stale-or-ambiguous',
      ],
    ];
    for (const [candidate, reason] of cases) {
      const result = classifyRemediationCandidate(candidate, { now: NOW });
      assert.equal(result.selected, false, reason);
      assert.equal(result.reason, reason);
      assert.ok(['blocked', 'split'].includes(result.outcome), reason);
    }
  });

  it('honors an explicit engineering implementation admission while unresolved founder decisions remain blocked', () => {
    const approvedDescription = `Admission classification — engineering implementation.

Admission class: engineering-implementation

The sole remaining blocker is executable implementation/delivery proof. The preview-exception contract is fixed; earlier founder steering is resolved.

${SAFE_DESCRIPTION}`;
    const approved = classifyRemediationCandidate(
      issue('JOV-5995', {
        title: 'Admission classification — engineering implementation',
        description: approvedDescription,
      }),
      { now: NOW }
    );
    assert.equal(approved.selected, true);
    assert.equal(approved.reason, 'bounded-isolated-code-shippable');

    const unresolved = classifyRemediationCandidate(
      issue('JOV-5996', {
        title: 'Admission classification — engineering implementation',
        description: approvedDescription,
        labels: ['needs-decision'],
      }),
      { now: NOW }
    );
    assert.equal(unresolved.selected, false);
    assert.equal(unresolved.reason, 'human-taste-or-steering');
  });

  it('selects only bounded isolated issues and refuses overlapping ownership in a wave', () => {
    const independent = issue('JOV-32', {
      description: SAFE_DESCRIPTION.replace(
        'admission-gate.mjs',
        'docs/OVIE.md'
      ),
    });
    const built = receiptFor(
      [
        issue('JOV-30'),
        issue('JOV-31', { description: SAFE_DESCRIPTION }),
        independent,
      ],
      {
        previousCleanStreak: CLEAN_STREAK_REQUIRED,
        capacitySignals: healthySignals({
          workers: { running: 0, retrying: 0, maxConcurrent: 4 },
        }),
      }
    );
    assert.equal(built.schema, REMEDIATION_SCHEMA);
    const selected = built.cohort.selected.map(item => item.identifier);
    assert.ok(selected.includes('JOV-30'));
    assert.ok(!selected.includes('JOV-31'));
    const overlapRow = built.matrix.find(item => item.identifier === 'JOV-31');
    assert.equal(overlapRow.exclusion, 'overlapping-file-ownership');
    assert.equal(overlapRow.outcome, 'blocked');
  });

  it('tracks merged, repaired, split, superseded, and blocked outcomes with exact reasons', () => {
    const built = receiptFor(
      [
        issue('JOV-40', { state: 'Done' }),
        issue('JOV-41', {
          pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/41',
        }),
        issue('JOV-42', { children: [{ id: 'child' }] }),
        issue('JOV-43', {
          relations: [
            {
              type: 'duplicate',
              relatedIssue: { identifier: 'JOV-40' },
            },
          ],
        }),
        issue('JOV-44', { title: 'Change Stripe checkout pricing' }),
      ],
      {
        pullRequests: [
          {
            number: 40,
            state: 'MERGED',
            mergedAt: NOW,
            title: 'Fixes JOV-40',
            body: 'Fixes JOV-40',
          },
          {
            number: 41,
            state: 'OPEN',
            title: 'JOV-41',
            headRefName: 'symphony/JOV-41-fix',
            mergeStateStatus: 'CONFLICTING',
          },
        ],
      }
    );
    const byId = Object.fromEntries(
      built.matrix.map(item => [item.identifier, item])
    );
    assert.equal(byId['JOV-40'].outcome, 'merged');
    assert.equal(byId['JOV-41'].outcome, 'repaired-retried');
    assert.equal(byId['JOV-42'].outcome, 'split');
    assert.equal(byId['JOV-43'].outcome, 'superseded');
    assert.equal(byId['JOV-44'].outcome, 'blocked');
    assert.equal(byId['JOV-44'].reason, 'money');
  });

  it('backs off to zero on degraded capacity and scales only after clean cohorts', () => {
    const blocked = evaluateRuntimeCapacity(
      healthySignals({
        cloneLatencyMs: 20_000,
      }),
      { now: NOW, previousCleanStreak: CLEAN_STREAK_REQUIRED }
    );
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.cohortSize, 0);
    assert.equal(blocked.reason, 'clone-latency-high');

    const saturating = evaluateRuntimeCapacity(
      healthySignals({
        ci: { saturating: true, running: 40, queued: 12 },
      }),
      { now: NOW, previousCleanStreak: CLEAN_STREAK_REQUIRED }
    );
    assert.equal(saturating.reason, 'ci-saturating');

    const conflicts = evaluateRuntimeCapacity(
      healthySignals({
        pullRequests: [
          {
            number: 1,
            state: 'OPEN',
            mergeStateStatus: 'CONFLICTING',
          },
          { number: 2, state: 'OPEN', mergeStateStatus: 'CLEAN' },
          { number: 3, state: 'OPEN', mergeStateStatus: 'DIRTY' },
        ],
      }),
      { now: NOW, previousCleanStreak: CLEAN_STREAK_REQUIRED }
    );
    assert.equal(conflicts.reason, 'pr-conflict-rate-high');

    const missing = evaluateRuntimeCapacity(
      { schema: CAPACITY_SCHEMA, observedAt: NOW },
      { now: NOW }
    );
    assert.equal(
      missing.reason,
      'capacity-evidence-missing-malformed-or-stale'
    );

    const warming = evaluateRuntimeCapacity(healthySignals(), {
      now: NOW,
      previousCleanStreak: 0,
      previousCohortSize: 0,
    });
    assert.equal(warming.allowed, true);
    assert.equal(warming.cohortSize, 1);
    assert.equal(warming.reason, 'scale-after-clean-cohorts');

    const scaled = evaluateRuntimeCapacity(
      healthySignals({
        workers: { running: 0, retrying: 0, maxConcurrent: 4 },
      }),
      {
        now: NOW,
        previousCleanStreak: CLEAN_STREAK_REQUIRED,
        previousCohortSize: 1,
      }
    );
    assert.equal(scaled.cohortSize, 4);
    assert.equal(scaled.reason, 'capacity-available');
  });

  it('writes a single workpad matrix and feeds only the official Elixir Symphony refresh', async () => {
    const built = receiptFor([issue('JOV-50')]);
    assert.match(built.workpad, new RegExp(`^${WORKPAD_PREFIX}`));
    assert.match(built.workpad, new RegExp(WORKPAD_HEADING));
    assert.match(built.workpad, /JOV-50/);
    assert.match(built.workpad, /official Elixir Symphony/);
    assert.equal(built.feed.refreshUrl, OFFICIAL_SYMPHONY_REFRESH_URL);
    assert.equal(built.feed.homemadeWrappers, 'forbidden');
    assert.equal(
      assertOfficialSymphonyFeed(OFFICIAL_SYMPHONY_REFRESH_URL),
      OFFICIAL_SYMPHONY_REFRESH_URL
    );
    assert.throws(
      () => assertOfficialSymphonyFeed('http://127.0.0.1:9999/homemade'),
      /homemade-symphony-admission-forbidden/
    );
    const fed = await feedOfficialSymphony({
      fetchImpl: async url => {
        assert.equal(url, OFFICIAL_SYMPHONY_REFRESH_URL);
        return {
          ok: true,
          json: async () => ({ queued: true, operations: ['poll'] }),
        };
      },
    });
    assert.equal(fed.status, 'queued');

    const comments = [];
    const result = await upsertRemediationWorkpad({
      workpadIssue: 'JOV-5492',
      receipt: built,
      client: {
        async fetchIssue(identifier) {
          assert.equal(identifier, 'JOV-5492');
          return {
            id: 'workpad-id',
            identifier,
            comments: { nodes: comments },
          };
        },
        async addComment(id, body) {
          comments.push({ id: 'comment-1', body });
          assert.equal(id, 'workpad-id');
          assert.ok(body.startsWith(WORKPAD_PREFIX));
          return { commentCreate: { success: true } };
        },
        async updateComment(id, body) {
          assert.equal(id, 'comment-1');
          comments[0] = { id, body };
          return { commentUpdate: { success: true } };
        },
      },
    });
    assert.equal(result.status, 'created');
    const existing = findWorkpadComment({ comments });
    assert.ok(existing);
    const updated = await upsertRemediationWorkpad({
      workpadIssue: 'JOV-5492',
      receipt: built,
      client: {
        async fetchIssue() {
          return {
            id: 'workpad-id',
            identifier: 'JOV-5492',
            comments: { nodes: comments },
          };
        },
        async addComment() {
          throw new Error('should-update-existing-workpad');
        },
        async updateComment(id, body) {
          assert.equal(id, 'comment-1');
          comments[0] = { id, body };
          return { commentUpdate: { success: true } };
        },
      },
    });
    assert.equal(updated.status, 'updated');
  });

  it('does not revive homemade Symphony admission or JOV-5466 wrappers', () => {
    assert.match(MODULE, /JOV-5466/);
    assert.match(MODULE, /homemadeWrappers: 'forbidden'/);
    assert.match(MODULE, /official-elixir-symphony/);
    assert.doesNotMatch(MODULE, /custom-symphony-controller\s*=/);
    assert.match(ORCHESTRATOR, /backlog-remediation/);
    const workflow = readFileSync(
      resolve(
        fileURLToPath(
          new URL(
            '../../../.github/workflows/fleet-gate-refresh.yml',
            import.meta.url
          )
        )
      ),
      'utf8'
    );
    assert.match(workflow, /backlog-orchestrator\.mjs" remediate/);
    assert.doesNotMatch(workflow, /run-backlog\.sh/);
    assert.doesNotMatch(workflow, /JOV-5466/);
  });
});

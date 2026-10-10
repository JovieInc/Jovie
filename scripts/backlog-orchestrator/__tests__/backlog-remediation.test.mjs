import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertOfficialSymphonyFeed,
  bridgeSelectedIssueToLanes,
  bridgeSelectedToLanes,
  buildRemediationReceipt,
  CAPACITY_MAX_AGE_MS,
  CAPACITY_SCHEMA,
  CLEAN_STREAK_REQUIRED,
  classifyRemediationCandidate,
  evaluateRuntimeCapacity,
  feedOfficialSymphony,
  findWorkpadComment,
  inventoryBacklog,
  isErroredPullRequest,
  OFFICIAL_SYMPHONY_REFRESH_URL,
  pullRequestRates,
  REMEDIATION_SCHEMA,
  readHostPressure,
  readLanesCapacity,
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
    state: { name: overrides.state || 'Todo' },
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
      loadAvg1: 1,
      cpuCount: 4,
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
  it('keeps draft PRs in the issue attribution so a draft-only issue is not PR-less', () => {
    // JOV-8000 follow-up 9 (a)1: the collector keeps drafts in the inventory
    // (only pullRequestRates excludes them); inventoryBacklog maps them, so
    // an issue whose only open PR is a draft still has an open PR and is not
    // re-selected, and a duplicate PR row does not split the issue.
    const draftOnly = inventoryBacklog([issue('JOV-30')], {
      pullRequests: [
        {
          number: 7,
          state: 'OPEN',
          title: 'fix JOV-30',
          headRefName: 'symphony/JOV-30',
          body: 'JOV-30',
          isDraft: true,
          mergeStateStatus: 'DIRTY',
          mergeable: false,
          labels: [],
        },
      ],
    });
    assert.deepEqual(draftOnly.rows[0].openPullRequests, [7]);
    const splitCheck = inventoryBacklog([issue('JOV-31')], {
      pullRequests: [
        {
          number: 8,
          state: 'OPEN',
          title: 'fix JOV-31',
          headRefName: 'symphony/JOV-31',
          body: 'JOV-31',
          isDraft: false,
          mergeable: true,
          mergeStateStatus: 'CLEAN',
          labels: [],
        },
        {
          number: 8,
          state: 'OPEN',
          title: 'fix JOV-31 (duplicate row)',
          headRefName: 'symphony/JOV-31',
          body: 'JOV-31',
          isDraft: false,
          mergeable: true,
          mergeStateStatus: 'CLEAN',
          labels: [],
        },
      ],
    });
    // Defense in depth (follow-up 10): inventoryBacklog dedupes by PR
    // number while building byIssue, so duplicated rows never split the
    // issue — one entry per PR.
    assert.deepEqual(splitCheck.rows[0].openPullRequests, [8]);
  });

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

  it('keeps taste work eligible while excluding machine safety boundaries', () => {
    for (const candidate of [
      issue('JOV-19', { title: 'Founder steering on brand voice' }),
      issue('JOV-20', { labels: ['needs-decision', 'needs:taste'] }),
      issue('JOV-18', {
        title: 'Founder steering on visual identity',
        assignee: { id: 'tim', name: 'Tim White' },
      }),
    ]) {
      const result = classifyRemediationCandidate(candidate, { now: NOW });
      assert.equal(result.selected, true, result.reason);
      assert.notEqual(result.reason, 'human-taste-or-steering');
    }
    assert.doesNotMatch(MODULE, /human-taste-or-steering/);

    /** @type {Array<[object, string]>} */
    const cases = [
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
    const description = `Admission class: engineering-implementation\n\n${SAFE_DESCRIPTION}`;
    const approved = classifyRemediationCandidate(
      issue('JOV-5995', { description }),
      { now: NOW }
    );
    assert.equal(approved.selected, true);
    assert.equal(approved.reason, 'bounded-isolated-code-shippable');

    const unresolved = classifyRemediationCandidate(
      issue('JOV-5996', { description, labels: ['needs-decision'] }),
      { now: NOW }
    );
    assert.equal(unresolved.selected, true);
    assert.equal(unresolved.reason, 'bounded-isolated-code-shippable');

    const deadLetter = classifyRemediationCandidate(
      issue('JOV-5997', { description, labels: ['no-symphony'] }),
      { now: NOW }
    );
    assert.equal(deadLetter.selected, false);
    assert.equal(deadLetter.reason, 'machine-hold');
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

    // JOV-8000 follow-up 9: auditable rates — the population excludes drafts
    // and label-quarantined rows (queue-poison, hold; `gated` stays counted),
    // BEHIND is not a conflict, UNKNOWN never counts as conflicting/clean/
    // errored, and the rates list PR numbers with the excluded breakdown.
    const fleet = [
      {
        number: 1,
        state: 'OPEN',
        isDraft: false,
        labels: [],
        mergeable: false,
        mergeStateStatus: 'DIRTY',
      },
      {
        number: 2,
        state: 'OPEN',
        isDraft: false,
        labels: [],
        mergeable: true,
        mergeStateStatus: 'CLEAN',
      },
      {
        number: 3,
        state: 'OPEN',
        isDraft: false,
        labels: [],
        mergeable: true,
        mergeStateStatus: 'BEHIND',
      },
      {
        number: 4,
        state: 'OPEN',
        isDraft: false,
        labels: [],
        mergeable: true,
        mergeStateStatus: 'UNSTABLE',
        statusCheckRollup: { state: 'SUCCESS' },
      },
      {
        number: 5,
        state: 'OPEN',
        isDraft: false,
        labels: [],
        mergeable: true,
        mergeStateStatus: 'UNSTABLE',
        statusCheckRollup: { state: 'FAILURE' },
      },
      {
        number: 6,
        state: 'OPEN',
        isDraft: false,
        labels: [],
        mergeable: 'UNKNOWN',
        mergeStateStatus: 'UNKNOWN',
      },
      {
        number: 7,
        state: 'OPEN',
        isDraft: false,
        labels: [{ name: 'queue-poison' }],
        mergeable: false,
        mergeStateStatus: 'DIRTY',
      },
      {
        number: 8,
        state: 'OPEN',
        isDraft: false,
        labels: [{ name: 'hold' }],
        mergeable: true,
        mergeStateStatus: 'CLEAN',
      },
      {
        number: 9,
        state: 'OPEN',
        isDraft: false,
        labels: [{ name: 'gated' }],
        mergeable: true,
        mergeStateStatus: 'CLEAN',
      },
      {
        number: 10,
        state: 'OPEN',
        isDraft: true,
        labels: [],
        mergeable: false,
        mergeStateStatus: 'DIRTY',
      },
    ];
    const auditable = pullRequestRates(fleet);
    assert.equal(auditable.total, 7);
    assert.deepEqual(auditable.conflictingPullRequests, [1]);
    assert.deepEqual(auditable.erroredPullRequests, [5]);
    assert.deepEqual(auditable.unknownPullRequests, [6]);
    assert.deepEqual(auditable.excluded.draft, [10]);
    assert.deepEqual(auditable.excluded.quarantined, [7, 8]);
    assert.equal(auditable.conflictRate, 1 / 7);
    assert.equal(auditable.errorRate, 1 / 7);
    // Error definition: UNSTABLE with a SUCCESS rollup is NOT errored;
    // rollup FAILURE IS errored regardless of mergeStateStatus.
    assert.equal(isErroredPullRequest(fleet[3]), false);
    assert.equal(isErroredPullRequest(fleet[4]), true);
    assert.equal(isErroredPullRequest({ mergeStateStatus: 'UNSTABLE' }), false);
    assert.equal(
      isErroredPullRequest({ statusCheckRollup: { state: 'FAILURE' } }),
      true
    );
    assert.equal(
      isErroredPullRequest({ reviewDecision: 'CHANGES_REQUESTED' }),
      false
    );
    // UNKNOWN rows fail the gate closed above a 20% share, never silently
    // counted as clean or conflicting.
    const unknownHeavy = evaluateRuntimeCapacity(
      healthySignals({
        pullRequests: [
          {
            number: 1,
            state: 'OPEN',
            isDraft: false,
            labels: [],
            mergeable: true,
            mergeStateStatus: 'CLEAN',
          },
          {
            number: 2,
            state: 'OPEN',
            isDraft: false,
            labels: [],
            mergeable: 'UNKNOWN',
            mergeStateStatus: 'UNKNOWN',
          },
          {
            number: 3,
            state: 'OPEN',
            isDraft: false,
            labels: [],
            mergeable: 'UNKNOWN',
            mergeStateStatus: 'UNKNOWN',
          },
        ],
      }),
      { now: NOW, previousCleanStreak: CLEAN_STREAK_REQUIRED }
    );
    assert.equal(unknownHeavy.reason, 'pr-mergeability-unknown');
    // Follow-up 10: a missing rollup fetch NEVER reads as zero errored —
    // the prRollups:false signal fails the gate closed with the named cause.
    const rollupMissing = evaluateRuntimeCapacity(
      healthySignals({
        pullRequests: [
          {
            number: 1,
            state: 'OPEN',
            isDraft: false,
            labels: [],
            mergeable: 'MERGEABLE',
            mergeStateStatus: 'CLEAN',
          },
          {
            number: 2,
            state: 'OPEN',
            isDraft: false,
            labels: [],
            mergeable: 'MERGEABLE',
            mergeStateStatus: 'CLEAN',
          },
          {
            number: 3,
            state: 'OPEN',
            isDraft: false,
            labels: [],
            mergeable: 'MERGEABLE',
            mergeStateStatus: 'CLEAN',
          },
        ],
        prRollups: false,
      }),
      { now: NOW, previousCleanStreak: CLEAN_STREAK_REQUIRED }
    );
    assert.equal(rollupMissing.allowed, false);
    assert.equal(rollupMissing.reason, 'pr-check-rollup-unavailable');
    // mergeable CONFLICTING counts as a conflict even with a CLEAN
    // mergeStateStatus (gh computes mergeable as MERGEABLE/CONFLICTING/UNKNOWN).
    const mergeableConflicting = pullRequestRates([
      {
        number: 1,
        state: 'OPEN',
        isDraft: false,
        labels: [],
        mergeable: 'CONFLICTING',
        mergeStateStatus: 'CLEAN',
      },
      {
        number: 2,
        state: 'OPEN',
        isDraft: false,
        labels: [],
        mergeable: 'MERGEABLE',
        mergeStateStatus: 'CLEAN',
      },
    ]);
    assert.deepEqual(mergeableConflicting.conflictingPullRequests, [1]);
    assert.equal(mergeableConflicting.conflictRate, 0.5);
    const unknownLight = evaluateRuntimeCapacity(
      healthySignals({
        pullRequests: [
          {
            number: 1,
            state: 'OPEN',
            isDraft: false,
            labels: [],
            mergeable: true,
            mergeStateStatus: 'CLEAN',
          },
          {
            number: 2,
            state: 'OPEN',
            isDraft: false,
            labels: [],
            mergeable: 'UNKNOWN',
            mergeStateStatus: 'UNKNOWN',
          },
          {
            number: 3,
            state: 'OPEN',
            isDraft: false,
            labels: [],
            mergeable: true,
            mergeStateStatus: 'CLEAN',
          },
          {
            number: 4,
            state: 'OPEN',
            isDraft: false,
            labels: [],
            mergeable: true,
            mergeStateStatus: 'CLEAN',
          },
          {
            number: 5,
            state: 'OPEN',
            isDraft: false,
            labels: [],
            mergeable: true,
            mergeStateStatus: 'CLEAN',
          },
        ],
      }),
      { now: NOW, previousCleanStreak: CLEAN_STREAK_REQUIRED }
    );
    assert.notEqual(unknownLight.reason, 'pr-mergeability-unknown');

    const missing = evaluateRuntimeCapacity(
      { schema: CAPACITY_SCHEMA, observedAt: NOW },
      { now: NOW }
    );
    assert.match(
      missing.reason,
      /^capacity-evidence-missing-malformed-or-stale:/
    );
    assert.deepEqual(missing.gaps, [
      'workers',
      'provider',
      'cloneLatencyMs',
      'ci',
      'mergeQueue',
      'pullRequests',
    ]);

    const providerUnknown = evaluateRuntimeCapacity(
      healthySignals({ provider: null }),
      { now: NOW, previousCleanStreak: CLEAN_STREAK_REQUIRED }
    );
    assert.equal(
      providerUnknown.reason,
      'capacity-evidence-missing-malformed-or-stale:provider'
    );
    assert.deepEqual(providerUnknown.gaps, ['provider']);

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

  it('parses host pressure from an isolated proc fixture', () => {
    const procRoot = mkdtempSync(join(tmpdir(), 'jovie-proc-fixture-'));
    try {
      mkdirSync(join(procRoot, 'pressure'), { recursive: true });
      writeFileSync(
        join(procRoot, 'pressure/cpu'),
        'some avg10=1.50 avg60=0.90 avg300=0.40 total=111\n' +
          'full avg10=0.00 avg60=0.00 avg300=0.00 total=0\n'
      );
      writeFileSync(
        join(procRoot, 'pressure/memory'),
        'some avg10=0.30 avg60=0.20 avg300=0.10 total=222\n' +
          'full avg10=0.10 avg60=0.05 avg300=0.02 total=333\n'
      );
      writeFileSync(
        join(procRoot, 'pressure/io'),
        'some avg10=0.40 avg60=0.30 avg300=0.20 total=444\n' +
          'full avg10=0.20 avg60=0.10 avg300=0.05 total=555\n'
      );
      writeFileSync(join(procRoot, 'loadavg'), '2.50 1.00 0.50 2/512 12345\n');
      writeFileSync(
        join(procRoot, 'cpuinfo'),
        'processor\t: 0\nmodel name\t: fixture\n\n' +
          'processor\t: 1\nmodel name\t: fixture\n\n' +
          'processor\t: 2\nmodel name\t: fixture\n\n' +
          'processor\t: 3\nmodel name\t: fixture\n'
      );
      writeFileSync(
        join(procRoot, 'meminfo'),
        'MemTotal:       33554432 kB\nMemFree:         8388608 kB\n' +
          'MemAvailable:   16777216 kB\n'
      );

      const host = readHostPressure(procRoot);
      assert.equal(host.cpuSomeAvg10, 1.5);
      assert.equal(host.memoryFullAvg10, 0.1);
      assert.equal(host.ioFullAvg10, 0.2);
      assert.equal(host.loadAvg1, 2.5);
      assert.equal(host.cpuCount, 4);
      assert.equal(host.availableMemoryBytes, 16777216 * 1024);
    } finally {
      rmSync(procRoot, { recursive: true, force: true });
    }
  });

  it('fails closed with null metrics when proc evidence is absent', () => {
    const host = readHostPressure('/nonexistent-proc-root-jov-7232');
    assert.deepEqual(host, {
      cpuSomeAvg10: null,
      memoryFullAvg10: null,
      ioFullAvg10: null,
      loadAvg1: null,
      cpuCount: null,
      availableMemoryBytes: null,
    });

    const unknown = evaluateRuntimeCapacity(healthySignals({ host }), {
      now: NOW,
      previousCleanStreak: CLEAN_STREAK_REQUIRED,
    });
    assert.equal(unknown.allowed, false);
    assert.equal(unknown.reason, 'host-pressure-unknown');
    assert.equal(unknown.pressure, 'unknown');
  });

  it('includes normalized host load in capacity evidence and backoff', () => {
    if (process.platform === 'linux') {
      const host = readHostPressure('/proc');
      assert.ok(Number.isFinite(host.loadAvg1));
      assert.ok(Number.isInteger(host.cpuCount));
      assert.ok(host.cpuCount > 0);
    }

    const overloaded = evaluateRuntimeCapacity(
      healthySignals({
        host: {
          cpuSomeAvg10: 1,
          memoryFullAvg10: 0.1,
          ioFullAvg10: 0.2,
          loadAvg1: 8,
          cpuCount: 4,
          availableMemoryBytes: 16 * 1024 ** 3,
        },
      }),
      { now: NOW, previousCleanStreak: CLEAN_STREAK_REQUIRED }
    );
    assert.equal(overloaded.reason, 'host-pressure-severe');
    assert.equal(overloaded.allowed, false);
  });

  it('writes a single workpad matrix and records the event-driven lanes feed', async () => {
    const built = receiptFor([issue('JOV-50')]);
    assert.match(built.workpad, new RegExp(`^${WORKPAD_HEADING}`));
    assert.match(built.workpad, new RegExp(WORKPAD_PREFIX));
    assert.match(built.workpad, new RegExp(WORKPAD_HEADING));
    assert.match(built.workpad, /JOV-50/);
    // JOV-8000: the Elixir :4041 feed is retired; the lanes are event-driven.
    assert.match(built.workpad, /shipping lanes \(event-driven tick/);
    assert.doesNotMatch(built.workpad, /official Elixir Symphony/);
    assert.equal(built.feed.refreshUrl, null);
    assert.equal(built.feed.owner, 'shipping-lanes');
    assert.equal(built.feed.homemadeWrappers, 'forbidden');
    // The official constant survives for legacy readers; new feed calls pass
    // no URL. Any homemade endpoint is forbidden.
    assert.throws(
      () => assertOfficialSymphonyFeed('http://127.0.0.1:9999/homemade'),
      /homemade-symphony-admission-forbidden/
    );
    assert.equal(assertOfficialSymphonyFeed(null), '');
    const fed = await feedOfficialSymphony({ url: null });
    assert.equal(fed.status, 'event-driven');
    assert.deepEqual(fed.operations, ['minute-timer', 'worker-reexec']);
    // An explicit legacy URL still routes through the guarded POST path.
    const legacyFed = await feedOfficialSymphony({
      fetchImpl: async url => {
        assert.equal(url, OFFICIAL_SYMPHONY_REFRESH_URL);
        return Response.json({ queued: true, operations: ['poll'] });
      },
    });
    assert.equal(legacyFed.status, 'queued');

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
          assert.ok(body.startsWith(WORKPAD_HEADING));
          assert.match(body, new RegExp(WORKPAD_PREFIX));
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

  it('updates the legacy remediation comment instead of creating a second workpad', async () => {
    const comments = [
      {
        id: 'legacy-comment',
        body: '## Symphony backlog remediation\nold receipt',
      },
    ];
    const result = await upsertRemediationWorkpad({
      workpadIssue: 'JOV-5492',
      receipt: receiptFor([issue('JOV-51')]),
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
          assert.equal(id, 'legacy-comment');
          comments[0] = { id, body };
          return { commentUpdate: { success: true } };
        },
      },
    });
    assert.equal(result.status, 'updated');
    assert.match(comments[0].body, new RegExp(`^${WORKPAD_HEADING}`));
  });

  it('does not revive homemade Symphony admission or JOV-5466 wrappers', () => {
    assert.match(MODULE, /JOV-5466/);
    assert.match(MODULE, /homemadeWrappers: 'forbidden'/);
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

describe('lanes-measured capacity evidence (JOV-8000)', () => {
  const NOW_MS = Date.parse('2026-10-08T12:00:00.000Z');
  const lanesDoctorReport = overrides => ({
    at: '2026-10-08T11:59:59Z',
    alerts: {},
    issues: {},
    conditions: {},
    observed: {
      now: NOW_MS / 1000 - 30,
      capacityByProvider: {
        devin: { slots: 4, running: 1, base: 4 },
        codex: { slots: 3, running: 2, base: 3 },
        claude: { slots: 2, running: 0, base: 2 },
      },
      codexAttribution: {
        state: 'unleased-available',
        count: 5,
        leased: 2,
        eligibleByCooldown: 4,
        unleasedAvailable: 3,
        quotaBanked: 0,
      },
      ...overrides,
    },
  });

  const writeReport = (dir, report, ageMs = 30_000) => {
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'doctor.json');
    writeFileSync(path, JSON.stringify(report));
    const past = new Date(NOW_MS - ageMs);
    execFileSync('touch', ['-d', past.toISOString(), path]);
  };

  it('maps the doctor report to measured workers and provider evidence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lanes-capacity-'));
    try {
      writeReport(dir, lanesDoctorReport(), 30_000);
      const capacity = readLanesCapacity({ lanesStateDir: dir, nowMs: NOW_MS });
      assert.deepEqual(capacity.workers, {
        running: 3,
        retrying: 0,
        maxConcurrent: 9,
      });
      assert.deepEqual(capacity.provider, { accounts: 5, ready: 4 });
      assert.equal(capacity.source, 'lanes-doctor-report');
      assert.equal(typeof capacity.observedAt, 'string');
      // The doctor's per-issue rejection reasons ride the capacity read so
      // the remediator can log route-held / over-budget without host access.
      assert.deepEqual(capacity.rejectedIssues, {});
      const required = evaluateRuntimeCapacity(
        {
          schema: CAPACITY_SCHEMA,
          observedAt: new Date(NOW_MS).toISOString(),
          ...capacity,
          host: healthySignals().host,
          cloneLatencyMs: 800,
          ci: { saturating: false, running: 2, queued: 0 },
          pullRequests: [],
          mergeQueue: { health: 'healthy', entries: 1 },
        },
        {
          now: new Date(NOW_MS).toISOString(),
          previousCleanStreak: CLEAN_STREAK_REQUIRED,
        }
      );
      assert.equal(required.allowed, true);
      assert.equal(required.cohortSize, 6);
      assert.equal(required.reason, 'capacity-available');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when the doctor report is missing, stale, or malformed', () => {
    const missing = readLanesCapacity({
      lanesStateDir: join(tmpdir(), 'lanes-capacity-absent'),
      nowMs: NOW_MS,
    });
    assert.equal(missing, null);

    const staleDir = mkdtempSync(join(tmpdir(), 'lanes-capacity-'));
    try {
      writeReport(staleDir, lanesDoctorReport(), CAPACITY_MAX_AGE_MS + 60_000);
      assert.equal(
        readLanesCapacity({ lanesStateDir: staleDir, nowMs: NOW_MS }),
        null
      );

      const malformedDir = mkdtempSync(join(tmpdir(), 'lanes-capacity-'));
      writeReport(malformedDir, { observed: { capacityByProvider: [] } });
      assert.equal(
        readLanesCapacity({ lanesStateDir: malformedDir, nowMs: NOW_MS }),
        null
      );

      const badSeatsDir = mkdtempSync(join(tmpdir(), 'lanes-capacity-'));
      writeReport(
        badSeatsDir,
        lanesDoctorReport({ capacityByProvider: { codex: { slots: 3 } } })
      );
      assert.equal(
        readLanesCapacity({ lanesStateDir: badSeatsDir, nowMs: NOW_MS }),
        null
      );

      const emptySeatsDir = mkdtempSync(join(tmpdir(), 'lanes-capacity-'));
      writeReport(
        emptySeatsDir,
        lanesDoctorReport({
          capacityByProvider: { codex: { slots: 0, running: 0 } },
        })
      );
      assert.equal(
        readLanesCapacity({ lanesStateDir: emptySeatsDir, nowMs: NOW_MS }),
        null
      );
    } finally {
      rmSync(staleDir, { recursive: true, force: true });
    }
  });

  it('keeps the lanes doctor report as the primary orchestrator capacity source', () => {
    assert.match(ORCHESTRATOR, /backlogRemediation\.readLanesCapacity\(\)/);
    assert.match(MODULE, /source: 'lanes-doctor-report'/);
    // A fresh lanes report with an unknown codex attribution (status-probe
    // error) still yields worker seats; the provider signal then falls back
    // to codex-rotate account evidence instead of blanking the whole receipt.
    assert.match(
      ORCHESTRATOR,
      /\(lanes && lanes\.provider\) \|\| rotateProvider\(\)/
    );
    const attributionUnknown = readLanesCapacity({
      lanesStateDir: (() => {
        const dir = mkdtempSync(join(tmpdir(), 'lanes-capacity-unknown-'));
        writeReport(dir, {
          at: '2026-10-08T11:59:59Z',
          alerts: {},
          observed: {
            now: NOW_MS / 1000 - 30,
            capacityByProvider: { codex: { slots: 3, running: 2, base: 3 } },
            codexAttribution: {
              state: 'unknown',
              reason: 'account-status-unavailable',
            },
          },
        });
        return dir;
      })(),
      nowMs: NOW_MS,
    });
    assert.equal(attributionUnknown.provider, null);
    assert.deepEqual(attributionUnknown.workers, {
      running: 2,
      retrying: 0,
      maxConcurrent: 3,
    });
  });
  it('carries the doctor per-issue rejectedIssues through the capacity read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lanes-capacity-rejected-'));
    try {
      writeReport(
        dir,
        lanesDoctorReport({
          rejectedIssues: {
            'JOV-6269': 'route-held:frontier',
            'JOV-100': 'over-budget',
          },
        }),
        30_000
      );
      const capacity = readLanesCapacity({ lanesStateDir: dir, nowMs: NOW_MS });
      assert.deepEqual(capacity.rejectedIssues, {
        'JOV-6269': 'route-held:frontier',
        'JOV-100': 'over-budget',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('capacity workers observability (JOV-8000 follow-up 40)', () => {
  it('carries measured worker running/max/source/observedAt onto the receipt', () => {
    const built = buildRemediationReceipt({
      issues: [],
      pullRequests: [],
      mainSha: MAIN,
      capacitySignals: healthySignals({
        workers: { running: 2, retrying: 0, maxConcurrent: 4 },
        workersSource: 'lanes-doctor-report',
        workersObservedAt: '2026-10-10T15:00:00.000Z',
      }),
      previousCleanStreak: CLEAN_STREAK_REQUIRED,
      now: NOW,
    });
    assert.deepEqual(built.workers, {
      running: 2,
      maxConcurrent: 4,
      source: 'lanes-doctor-report',
      observedAt: '2026-10-10T15:00:00.000Z',
    });
  });

  it('a fresh doctor report with running==maxConcurrent still yields workers-saturated and the counts on the line', () => {
    const gate = evaluateRuntimeCapacity(
      healthySignals({
        workers: { running: 4, retrying: 0, maxConcurrent: 4 },
        workersSource: 'lanes-doctor-report',
        workersObservedAt: NOW,
      }),
      { now: NOW, previousCleanStreak: CLEAN_STREAK_REQUIRED }
    );
    assert.equal(gate.allowed, false);
    assert.equal(gate.reason, 'workers-saturated');
    assert.equal(gate.remaining, 0);
  });

  it('a stale/absent workers signal fails closed as capacity-evidence missing (workers)', () => {
    const missing = evaluateRuntimeCapacity(
      { schema: CAPACITY_SCHEMA, observedAt: NOW },
      { now: NOW }
    );
    assert.match(
      missing.reason,
      /capacity-evidence-missing-malformed-or-stale/
    );
    assert.ok(missing.gaps.includes('workers'));
  });
});

describe('selected-to-lanes bridge (JOV-8000 follow-up 38)', () => {
  const AGENT_READY = { id: 'label-agent-ready', name: 'agent-ready' };
  const TEAM_ID = 'bdc09edc-f91c-4a06-b308-74b4fcf093f8';

  function selectedIssue(overrides = {}) {
    return {
      id: 'id-JOV-100',
      identifier: 'JOV-100',
      title: 'Repair one controller edge',
      description: SAFE_DESCRIPTION,
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-30T00:00:00.000Z',
      priority: 3,
      state: { name: 'Todo' },
      assignee: null,
      labels: { nodes: [{ id: 'label-bug', name: 'bug' }] },
      comments: { nodes: [] },
      ...overrides,
    };
  }

  function fakeClient(
    issue,
    calls = { updates: [], comments: [], fetches: 0 }
  ) {
    return {
      calls,
      async fetchIssue() {
        calls.fetches += 1;
        return issue;
      },
      async fetchTeamLabel(_team, name) {
        return name === 'agent-ready' ? AGENT_READY : null;
      },
      async updateIssue(id, input) {
        calls.updates.push({ id, input });
        return { issueUpdate: { success: true } };
      },
      async addComment(id, body) {
        calls.comments.push({ id, body });
        return { commentCreate: { success: true } };
      },
    };
  }

  it('bridges a clean selected Todo issue: one updateIssue, labels preserved, one marker comment', async () => {
    const issue = selectedIssue();
    const client = fakeClient(issue);
    const receipt = await bridgeSelectedIssueToLanes({
      issue,
      client,
      agentReadyLabel: AGENT_READY,
      inventory: {},
    });
    assert.equal(receipt.outcome, 'bridged');
    assert.equal(client.calls.updates.length, 1);
    // existing label ids preserved, agent-ready appended
    assert.deepEqual(client.calls.updates[0].input.labelIds.sort(), [
      'label-agent-ready',
      'label-bug',
    ]);
    assert.equal(client.calls.comments.length, 1);
    assert.match(
      client.calls.comments[0].body,
      /<!-- symphony-backlog-remediation\/bridge v1 fp=[0-9a-f]{24} -->/
    );
  });

  it('no write when agent-ready already exists', async () => {
    const issue = selectedIssue({
      labels: { nodes: [{ id: 'label-agent-ready', name: 'agent-ready' }] },
    });
    const client = fakeClient(issue);
    const receipt = await bridgeSelectedIssueToLanes({
      issue,
      client,
      agentReadyLabel: AGENT_READY,
      inventory: {},
    });
    assert.equal(receipt.outcome, 'already-ready');
    assert.equal(client.calls.updates.length, 0);
    // marker still posted once
    assert.equal(client.calls.comments.length, 1);
  });

  it('skips with a named reason when assigned, wrong state, or protected', async () => {
    // assigned
    const assigned = selectedIssue({
      assignee: { id: 'tim', name: 'Tim White' },
    });
    let client = fakeClient(assigned);
    let receipt = await bridgeSelectedIssueToLanes({
      issue: assigned,
      client,
      agentReadyLabel: AGENT_READY,
      inventory: {},
    });
    assert.equal(receipt.outcome, 'skipped:assigned');
    assert.equal(client.calls.updates.length, 0);
    // wrong state
    const inProgress = selectedIssue({ state: { name: 'In Progress' } });
    client = fakeClient(inProgress);
    receipt = await bridgeSelectedIssueToLanes({
      issue: inProgress,
      client,
      agentReadyLabel: AGENT_READY,
      inventory: {},
    });
    assert.match(receipt.outcome, /^skipped:state-/);
    assert.equal(client.calls.updates.length, 0);
    // protected label
    const protectedIssue = selectedIssue({
      labels: { nodes: [{ id: 'l', name: 'protected' }] },
    });
    client = fakeClient(protectedIssue);
    receipt = await bridgeSelectedIssueToLanes({
      issue: protectedIssue,
      client,
      agentReadyLabel: AGENT_READY,
      inventory: {},
    });
    assert.equal(receipt.outcome, 'skipped:protected-label');
    assert.equal(client.calls.updates.length, 0);
    assert.equal(client.calls.comments.length, 0);
  });

  it('skips when a protected-policy label trips pre-admission (e.g. no-symphony)', async () => {
    const noSymphony = selectedIssue({
      labels: { nodes: [{ id: 'l2', name: 'no-symphony' }] },
    });
    const client = fakeClient(noSymphony);
    const receipt = await bridgeSelectedIssueToLanes({
      issue: noSymphony,
      client,
      agentReadyLabel: AGENT_READY,
      inventory: {},
    });
    assert.equal(receipt.outcome, 'skipped:protected-label');
    assert.equal(client.calls.updates.length, 0);
  });

  it('skips when the issue already has an open PR', async () => {
    const client = fakeClient(selectedIssue());
    const receipt = await bridgeSelectedIssueToLanes({
      issue: selectedIssue(),
      client,
      agentReadyLabel: AGENT_READY,
      inventory: { 'JOV-100': { openPullRequests: [555] } },
    });
    assert.equal(receipt.outcome, 'skipped:existing-open-pr');
    assert.equal(client.calls.updates.length, 0);
  });

  it('an empty cohort makes zero Linear calls', async () => {
    let touched = 0;
    const client = {
      async fetchIssue() {
        touched += 1;
      },
      async fetchTeamLabel() {
        touched += 1;
      },
    };
    const receipt = await bridgeSelectedToLanes({
      cohort: { selected: [] },
      client,
      teamId: TEAM_ID,
    });
    assert.equal(receipt.enabled, true);
    assert.equal(receipt.calls, 0);
    assert.deepEqual(receipt.bridged, []);
    assert.equal(touched, 0);
  });

  it('the kill-switch env flag disables the bridge with zero calls', async () => {
    let touched = 0;
    const client = {
      async fetchIssue() {
        touched += 1;
      },
      async fetchTeamLabel() {
        touched += 1;
      },
    };
    const receipt = await bridgeSelectedToLanes({
      cohort: { selected: [selectedIssue()] },
      client,
      teamId: TEAM_ID,
      env: { JOVIE_BRIDGE_LANES: '0' },
    });
    assert.equal(receipt.enabled, false);
    assert.equal(touched, 0);
  });

  it('bridges the selected set end-to-end and records per-issue receipts', async () => {
    const client = fakeClient(selectedIssue());
    const receipt = await bridgeSelectedToLanes({
      cohort: { selected: [selectedIssue()] },
      client,
      teamId: TEAM_ID,
      inventory: {},
      env: {},
    });
    assert.equal(receipt.schema, 'symphony-bridge-lanes/v1');
    assert.equal(receipt.bridged.length, 1);
    assert.equal(receipt.bridged[0].outcome, 'bridged');
  });
});

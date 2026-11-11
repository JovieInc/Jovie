import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { expect } from 'vitest';
import { createApiClient } from '../../../packages/api-client/client.ts';
import { MemoryLedgerStore } from '../../../packages/api-client/store.ts';
import { runLiveness as runLivenessImpl } from '../../automation-liveness.mjs';
import { revisionFailureDisposition } from '../../merge-group-failure-hold.mjs';
import { ADMISSION_BLOCKING_LABELS } from '../admission-hold-labels.mjs';
import { loadRegistry } from '../automation-registry.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = loadRegistry(repoRoot);
const NOW = Date.parse('2026-10-20T19:35:00Z');
const iso = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();

function only(id) {
  const entries = registry.entries.filter(entry => entry.id === id);
  expect(entries).toHaveLength(1);
  return { ...registry, entries };
}

function rowFor(report, id) {
  return report.results.find(row => row.id === id);
}

function fakeFetch(routes) {
  return async input => {
    const url = String(input);
    const hit = Object.entries(routes).find(([key]) => url.includes(key));
    if (!hit) throw new Error(`Unexpected fixture request: ${url}`);
    return new Response(JSON.stringify(hit[1]), {
      status: typeof hit[1] === 'number' ? hit[1] : 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

function runLiveness(options) {
  return runLivenessImpl({
    lsRemote: async () => null,
    ...options,
    githubClient: createApiClient({
      provider: 'github',
      credential: 'test',
      fetch: options.fetchImpl,
      store: new MemoryLedgerStore(),
      now: () => NOW,
      sleep: async () => {},
      random: () => 0,
    }),
  });
}

/** @typedef {{ rules: Array<{ type: string, parameters?: { required_status_checks?: Array<{ context: string }> } }> }} SourceRuleset */

export function assertRequiredSourceChecks() {
  const policy = /** @type {SourceRuleset} */ (
    load(
      readFileSync(
        join(repoRoot, '.github/rulesets/branch-protection.yml'),
        'utf8'
      )
    )
  );
  const required = policy.rules
    .find(rule => rule.type === 'required_status_checks')
    .parameters.required_status_checks.map(check => check.context);
  const observed = only('github:jovie:green-to-enqueue').entries[0].receipt
    .requiredChecks;
  expect([...observed].sort()).toEqual([...required].sort());
}

export async function assertGreenEnqueueDwell() {
  const pr = (number, extra = {}) => ({
    number,
    isDraft: false,
    isInMergeQueue: false,
    mergeStateStatus: 'CLEAN',
    baseRefName: 'main',
    headRefOid: String(number).repeat(40).slice(0, 40),
    labels: { nodes: [], pageInfo: { hasNextPage: false } },
    ...extra,
  });
  // PR Ready, Migration Guard, PR Size Guard and Company guards are check
  // runs; Fork PR Gate is a commit status. Green time is the latest required
  // success.
  const heads = greenMinutesAgo => ({
    check_runs: [
      {
        name: 'PR Ready',
        conclusion: 'success',
        completed_at: iso(greenMinutesAgo),
      },
      {
        name: 'Migration Guard',
        conclusion: 'success',
        completed_at: iso(greenMinutesAgo + 20),
      },
      {
        name: 'PR Size Guard',
        conclusion: 'success',
        completed_at: iso(greenMinutesAgo + 25),
      },
      {
        name: 'Company guards',
        conclusion: 'success',
        completed_at: iso(greenMinutesAgo + 15),
      },
    ],
  });
  const status = greenMinutesAgo => ({
    statuses: [
      {
        context: 'Fork PR Gate',
        state: 'success',
        created_at: iso(greenMinutesAgo + 30),
      },
    ],
  });
  const run = (list, green = 30, overrides = {}) =>
    runLiveness({
      registry: only('github:jovie:green-to-enqueue'),
      nowMs: NOW,
      token: 't',
      fetchImpl: fakeFetch({
        '/graphql':
          typeof list === 'number'
            ? list
            : { data: { repository: { pullRequests: { nodes: list } } } },
        '/check-runs': overrides.runs ?? heads(green),
        '/status': overrides.status ?? status(green),
      }),
    }).then(({ report }) => rowFor(report, 'github:jovie:green-to-enqueue'));
  const waiting = await run([pr(1)]);
  expect(waiting.status).toBe('stale');
  expect(waiting.ageMinutes).toBe(30);
  expect(waiting.reason).toContain('#1:30m');
  for (const conclusion of [null, 'failure']) {
    const runs = heads(30);
    runs.check_runs.find(check => check.name === 'Company guards').conclusion =
      conclusion;
    expect((await run([pr(1)], 30, { runs })).status).toBe('fresh');
  }
  const latestRequired = heads(30);
  latestRequired.check_runs.find(
    check => check.name === 'Company guards'
  ).completed_at = iso(4);
  expect((await run([pr(1)], 30, { runs: latestRequired })).ageMinutes).toBe(4);

  // JOV-8788: #22378 was required-green but queue-poison deliberately
  // prevented admission. Use the writer's vocabulary, including machine
  // blocks, and keep held heads out of the capped timing reads.
  const labeled = (number, name) =>
    pr(number, {
      labels: { nodes: [{ name }], pageInfo: { hasNextPage: false } },
    });
  for (const name of ADMISSION_BLOCKING_LABELS) {
    const held = await run([labeled(22378, name.toUpperCase())]);
    expect(held.status, name).toBe('fresh');
    expect(held.reason).toContain('label-held=1[#22378]');
  }
  const mixed = await run([
    ...Array.from({ length: 10 }, (_, i) => labeled(20 + i, 'queue-poison')),
    labeled(1, 'lane-fix-dequeued'),
  ]);
  expect(mixed.status).toBe('stale');
  expect(mixed.reason).toContain('ready-green-unqueued=1[#1:30m]');
  // Removing the hold resumes the existing SLO; unreadable or truncated
  // labels cannot certify that a ready PR is eligible.
  expect((await run([pr(22378)])).status).toBe('stale');
  for (const labels of [
    undefined,
    { nodes: [] },
    { nodes: [], pageInfo: { hasNextPage: true } },
    { nodes: [{}], pageInfo: { hasNextPage: false } },
  ]) {
    const unreadable = await run([pr(1, { labels })]);
    expect(unreadable.status).not.toBe('fresh');
    expect(unreadable.reason).toContain('green-enqueue-labels-unreadable');
  }
  // Inside the SLO, queued, conflicting, blocked or another base: fresh.
  expect((await run([pr(2)], 5)).status).toBe('fresh');
  expect((await run([pr(3, { isInMergeQueue: true })])).status).toBe('fresh');
  expect((await run([pr(4, { mergeStateStatus: 'DIRTY' })])).status).toBe(
    'fresh'
  );
  expect((await run([pr(5, { mergeStateStatus: 'BLOCKED' })])).status).toBe(
    'fresh'
  );
  expect((await run([pr(6, { baseRefName: 'release' })])).status).toBe('fresh');
  // A required name with no success yet (status pending) is not green.
  expect(
    (
      await run([pr(7)], 30, {
        status: {
          statuses: [
            {
              context: 'Fork PR Gate',
              state: 'pending',
              created_at: iso(30),
            },
          ],
        },
      })
    ).status
  ).toBe('fresh');
  // A merge-queue failure hold for a real defect needs a new head from its
  // owner, including retryable product failures: reported, not promotion
  // latency. A transient infrastructure hold still counts.
  const holdStatus = cls => ({
    statuses: [
      ...status(30).statuses,
      {
        context: 'jovie-queue-failure-hold/v1',
        state: 'success',
        description: `class=${cls};n=1;run=1;try=1`,
        creator: { type: 'Bot', login: 'jovie-ci-lane[bot]' },
        target_url: 'https://github.com/JovieInc/Jovie/actions/runs/1',
        created_at: iso(20),
      },
    ],
  });
  for (const classification of [
    'deterministic-source',
    'retryable-product',
    'unclassified',
  ]) {
    const status = holdStatus(classification);
    expect(
      revisionFailureDisposition({
        repository: 'JovieInc/Jovie',
        statuses: status.statuses,
      }).action
    ).toBe('block');
    const defect = await run([pr(10)], 30, { status });
    expect(defect.status, classification).toBe('fresh');
    expect(defect.reason).toContain('defect-held=1[#10]');
    expect(defect.reason).toContain('ready-green-unqueued=0[]');
  }
  expect(
    (
      await run([pr(11)], 30, {
        status: holdStatus('transient-infrastructure'),
      })
    ).status
  ).toBe('stale');
  // Green drafts are reported, but drafts belong to their writer.
  const draft = await run([pr(8, { isDraft: true })]);
  expect(draft.status).toBe('fresh');
  expect(draft.reason).toContain('draft-green=1[#8]');
  // Unreadable or unauthenticated is silence, never health.
  expect((await run(502)).status).not.toBe('fresh');
  expect((await run([pr(9)], 30, { runs: 502 })).status).not.toBe('fresh');
  const unauth = await runLiveness({
    registry: only('github:jovie:green-to-enqueue'),
    nowMs: NOW,
    fetchImpl: fakeFetch({
      '/graphql': { data: { repository: { pullRequests: { nodes: [] } } } },
    }),
  });
  expect(
    rowFor(unauth.report, 'github:jovie:green-to-enqueue').status
  ).not.toBe('fresh');
}

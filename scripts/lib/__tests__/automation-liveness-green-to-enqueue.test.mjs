// Green-to-enqueue observer regression tests, split from
// automation-liveness.test.mjs (JOV-8788): that file's committed size budget
// never rises, so new coverage for this observer lands here.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runLiveness as runLivenessImpl } from '../../automation-liveness.mjs';
import { livenessDecisions, loadRegistry } from '../automation-registry.mjs';
import { QUEUE_REMOVAL_REENROLL_MAX } from '../green-enqueue-admission.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = loadRegistry(repoRoot);
const NOW = Date.parse('2026-10-20T19:35:00Z');
const iso = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();

function runLiveness(options) {
  return runLivenessImpl({
    // Keep the suite off the network. Only the green-to-enqueue entry runs,
    // which never reads the git tip or the shared GitHub client.
    lsRemote: async () => null,
    ...options,
  });
}

function only(...ids) {
  const entries = registry.entries.filter(entry => ids.includes(entry.id));
  expect(entries.map(entry => entry.id).sort()).toEqual([...ids].sort());
  return { ...registry, entries };
}

function rowFor(report, id) {
  return report.results.find(row => row.id === id);
}

/** Fake network: URL substring -> JSON body (or a status number). */
function fakeFetch(routes) {
  return async input => {
    const url = String(input);
    const hit = Object.entries(routes).find(([key]) => url.includes(key));
    if (!hit) return new Response('{}', { status: 404 });
    const value = typeof hit[1] === 'function' ? hit[1](url) : hit[1];
    if (typeof value === 'number') return new Response('{}', { status: value });
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

describe('green-to-enqueue timing reads', () => {
  // JOV-8788: run 43163802915 filed green-enqueue-checks-unreadable while
  // the run's own budget sampler showed the shared-github-token REST budget
  // at 0/5000. A denied or exhausted Actions token on a per-head timing read
  // must not flip the whole observation unknown: retry once unauthenticated,
  // like the run-list observers (JOV-11677). A public read that also fails
  // keeps the observation red.
  const readyGreenPr = () => ({
    number: 1,
    isDraft: false,
    isInMergeQueue: false,
    mergeStateStatus: 'CLEAN',
    baseRefName: 'main',
    headRefOid: '1'.repeat(40),
    labels: { nodes: [], pageInfo: { hasNextPage: false } },
  });
  const timingRoutes = ready => ({
    '/graphql': {
      data: { repository: { pullRequests: { nodes: [ready] } } },
    },
    '/check-runs': {
      check_runs: [
        { name: 'PR Ready', conclusion: 'success', completed_at: iso(5) },
        {
          name: 'Migration Guard',
          conclusion: 'success',
          completed_at: iso(25),
        },
        { name: 'PR Size Guard', conclusion: 'success', completed_at: iso(30) },
      ],
    },
    '/status': {
      statuses: [
        {
          context: 'Fork PR Gate',
          state: 'success',
          created_at: iso(35),
        },
      ],
    },
  });
  const deniedTokenFetch = (network, deniedPath, alsoPublic = false) => {
    const authorizations = [];
    return {
      authorizations,
      fetchImpl: async (url, init) => {
        if (!String(url).includes(deniedPath)) return network(url, init);
        const authorization = new Headers(init.headers).get('authorization');
        authorizations.push(authorization);
        if (authorization || alsoPublic)
          return new Response(
            '{"message":"Resource not accessible by integration"}',
            { status: 403 }
          );
        return network(url, init);
      },
    };
  };

  it.each(['/check-runs', '/status'])(
    'recovers a denied Actions token on the per-head %s timing read',
    async deniedPath => {
      const network = fakeFetch(timingRoutes(readyGreenPr()));
      const { authorizations, fetchImpl } = deniedTokenFetch(
        network,
        deniedPath
      );
      const { report } = await runLiveness({
        registry: only('github:jovie:green-to-enqueue'),
        nowMs: NOW,
        token: 't',
        fetchImpl,
      });
      expect(authorizations).toEqual(['Bearer t', null]);
      const row = rowFor(report, 'github:jovie:green-to-enqueue');
      expect(row).toMatchObject({ status: 'fresh', ageMinutes: 5 });
      expect(row.reason).toContain('ready-green-unqueued=1[#1:5m]');
      expect(livenessDecisions(report)).toEqual([]);
    }
  );

  it('keeps a denied token red when the public timing read also fails', async () => {
    const network = fakeFetch(timingRoutes(readyGreenPr()));
    const { authorizations, fetchImpl } = deniedTokenFetch(
      network,
      '/check-runs',
      true
    );
    const { report } = await runLiveness({
      registry: only('github:jovie:green-to-enqueue'),
      nowMs: NOW,
      token: 't',
      fetchImpl,
    });
    expect(authorizations).toEqual(['Bearer t', null]);
    expect(rowFor(report, 'github:jovie:green-to-enqueue')).toMatchObject({
      status: 'unknown',
      reason: 'green-enqueue-checks-unreadable',
    });
    expect(livenessDecisions(report)[0].action).toBe('red');
  });
});

describe('queue-removal holds (JOV-8788)', () => {
  // 2026-11-14: #25253 sat ready, green, CLEAN and unqueued for 205 minutes
  // after its exact head had been removed from the merge queue three times
  // (two conflict-lane dequeues around a native ejection). The enroll
  // controller correctly refused to re-admit that unchanged head — the
  // bounded re-admission budget was spent, so only a new head from the PR's
  // owner re-enters the queue. The dead-man counted the PR as automation
  // silence and filed a false P0; it must report the hold instead.
  const removedPr = ({ removals, committedAgo = 240 }) => ({
    number: 1,
    isDraft: false,
    isInMergeQueue: false,
    mergeStateStatus: 'CLEAN',
    baseRefName: 'main',
    headRefOid: '1'.repeat(40),
    labels: { nodes: [], pageInfo: { hasNextPage: false } },
    commits: { nodes: [{ commit: { committedDate: iso(committedAgo) } }] },
    timelineItems: {
      nodes: removals.map(removal => ({
        createdAt: iso(removal.ago),
        actor: removal.actor,
      })),
    },
  });
  const bot = { __typename: 'Bot', login: 'jovie-bot[bot]' };
  const person = { __typename: 'User', login: 'itstimwhite' };
  const greenRoutes = pr => ({
    '/graphql': { data: { repository: { pullRequests: { nodes: [pr] } } } },
    '/check-runs': {
      check_runs: [
        { name: 'PR Ready', conclusion: 'success', completed_at: iso(205) },
        {
          name: 'Migration Guard',
          conclusion: 'success',
          completed_at: iso(205),
        },
        {
          name: 'PR Size Guard',
          conclusion: 'success',
          completed_at: iso(205),
        },
      ],
    },
    '/status': {
      statuses: [
        {
          context: 'Fork PR Gate',
          state: 'success',
          created_at: iso(205),
        },
      ],
    },
  });
  const observe = async pr => {
    const { report } = await runLiveness({
      registry: only('github:jovie:green-to-enqueue'),
      nowMs: NOW,
      token: 't',
      fetchImpl: fakeFetch(greenRoutes(pr)),
    });
    return {
      row: rowFor(report, 'github:jovie:green-to-enqueue'),
      decisions: livenessDecisions(report),
    };
  };

  it('reports a re-enroll-exhausted head as removal-held, not automation silence', async () => {
    const { row, decisions } = await observe(
      removedPr({
        removals: [
          { ago: 200, actor: bot },
          { ago: 150, actor: bot },
          { ago: 100, actor: bot },
        ],
      })
    );
    expect(row.status).toBe('fresh');
    expect(row.reason).toContain('ready-green-unqueued=0[]');
    expect(row.reason).toContain('removal-held=1[#1]');
    expect(decisions).toEqual([]);
  });

  it('still counts a head inside the bounded re-admission budget', async () => {
    const { row, decisions } = await observe(
      removedPr({
        removals: [
          { ago: 150, actor: bot },
          { ago: 100, actor: bot },
        ],
      })
    );
    expect(row.status).toBe('stale');
    expect(row.reason).toContain('ready-green-unqueued=1[#1:205m]');
    expect(row.reason).toContain('removal-held=0[]');
    expect(decisions[0].action).toBe('red');
  });

  it('never counts a head a person dequeued', async () => {
    const { row, decisions } = await observe(
      removedPr({ removals: [{ ago: 100, actor: person }] })
    );
    expect(row.status).toBe('fresh');
    expect(row.reason).toContain('removal-held=1[#1]');
    expect(decisions).toEqual([]);
  });

  it('counts the head again once a new commit follows the removal', async () => {
    // The removal predates the head commit, so the exact head being watched
    // has spent none of its re-admission budget: it still counts as waiting.
    const { row } = await observe(
      removedPr({ removals: [{ ago: 300, actor: bot }] })
    );
    expect(row.status).toBe('stale');
    expect(row.reason).toContain('ready-green-unqueued=1[#1:205m]');
    expect(row.reason).toContain('removal-held=0[]');
  });

  it('keeps QUEUE_REMOVAL_REENROLL_MAX equal to the enroll controller budget', () => {
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/merge-queue-green-enroll.yml'),
      'utf8'
    );
    const inline = /const REENROLL_MAX_REMOVALS = (\d+),/.exec(workflow);
    expect(inline).not.toBeNull();
    expect(Number(inline[1])).toBe(QUEUE_REMOVAL_REENROLL_MAX);
  });
});

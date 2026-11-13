import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  alertStateFor,
  observeGithubWorkflow,
} from '../../automation-liveness.mjs';
import { selectSourceGuards } from '../../ci-fast-lanes.mjs';
import {
  evaluateLiveness,
  livenessDecisions,
  livenessFingerprint,
  loadRegistry,
} from '../automation-registry.mjs';
import { mapTestReferences } from '../ci-script-test-inventory.mjs';
import { githubReadFailure, readGithubJson } from '../github-json-read.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = loadRegistry(repoRoot);

const NOW = Date.parse('2026-11-13T09:51:00Z');
const iso = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();
const RUNS_URL =
  'https://api.github.com/repos/JovieInc/Jovie/actions/workflows/spend-guard.yml/runs?status=completed&per_page=30&branch=main';

function only(...ids) {
  const entries = registry.entries.filter(entry => ids.includes(entry.id));
  expect(entries.map(entry => entry.id).sort()).toEqual([...ids].sort());
  return { ...registry, entries };
}

function spendGuardEntry() {
  const entry = registry.entries.find(
    row => row.id === 'lanes-clock:spend-guard'
  );
  expect(entry).toBeTruthy();
  return entry;
}

/**
 * Automation-liveness runs 43404659161 / 43406130330: the shared-github-token
 * REST budget answered 403 for the spend-guard run list AND the unauthenticated
 * retry (a throttled runner IP), filing a false P0 (JOV-10153) while its own
 * budget sampler showed 0/5000. A double 403 with a provably spent budget must
 * defer (the budget sentinel's convention) instead of deciding unknown.
 *
 * `rateLimit` is the GET /rate_limit body the fake serves the token (null: the
 * quota read itself fails); every other read is denied exactly as in the run.
 */
function doubleDeniedFetch(rateLimit) {
  return async (input, init) => {
    if (String(input).endsWith('/rate_limit')) {
      if (!rateLimit) return new Response('{}', { status: 403 });
      return new Response(JSON.stringify(rateLimit), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

const SPENT = {
  resources: {
    core: { limit: 5000, remaining: 0, reset: 1792525800, used: 5000 },
  },
};
const FUNDED = {
  resources: {
    core: { limit: 5000, remaining: 750, reset: 1792525800, used: 4250 },
  },
};

describe('a double 403 defers only while the shared budget is spent (JOV-10153)', () => {
  it('marks the read deferred when the token budget is at 0/5000', async () => {
    const fetchImpl = doubleDeniedFetch(SPENT);
    const read = await readGithubJson(RUNS_URL, {
      fetchImpl,
      token: 'actions-token',
      apiUrl: 'https://api.github.com',
    });
    expect(read).toEqual({
      ok: false,
      deferred: true,
      reason: 'quota-deferred',
    });
  });

  it('keeps the original failure when the budget still has headroom', async () => {
    const read = await readGithubJson(RUNS_URL, {
      fetchImpl: doubleDeniedFetch(FUNDED),
      token: 'actions-token',
      apiUrl: 'https://api.github.com',
    });
    expect(read).toEqual({ ok: false, reason: 'http-403' });
  });

  it('keeps the original failure when /rate_limit is unreadable', async () => {
    const read = await readGithubJson(RUNS_URL, {
      fetchImpl: doubleDeniedFetch(null),
      token: 'actions-token',
      apiUrl: 'https://api.github.com',
    });
    expect(read).toEqual({ ok: false, reason: 'http-403' });
  });

  it('never consults the quota when the caller passes no api base', async () => {
    const fetchImpl = vi.fn(doubleDeniedFetch(SPENT));
    const read = await readGithubJson(RUNS_URL, {
      fetchImpl,
      token: 'actions-token',
    });
    expect(read).toEqual({ ok: false, reason: 'http-403' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('the run-list observers defer instead of reporting unknown', () => {
  it('observes spend-guard as deferred while the budget is spent', async () => {
    const entry = spendGuardEntry();
    const observed = await observeGithubWorkflow(entry.receipt, {
      fetchImpl: doubleDeniedFetch(SPENT),
      token: 'actions-token',
    });
    expect(observed).toMatchObject({
      ok: false,
      deferred: true,
      reason: 'github-quota-deferred',
    });
  });

  it('stays an unknown failure when the budget has headroom', async () => {
    const entry = spendGuardEntry();
    const observed = await observeGithubWorkflow(entry.receipt, {
      fetchImpl: doubleDeniedFetch(FUNDED),
      token: 'actions-token',
    });
    expect(observed).toMatchObject({ ok: false, reason: 'github-http-403' });
    expect(observed.deferred).toBeFalsy();
  });

  it('carries the deferred flag through the failure shape helper', () => {
    expect(
      githubReadFailure({ ok: false, deferred: true, reason: 'quota-deferred' })
    ).toEqual({
      ok: false,
      deferred: true,
      reason: 'github-quota-deferred',
    });
    expect(githubReadFailure({ ok: false, reason: 'http-403' })).toEqual({
      ok: false,
      deferred: false,
      reason: 'github-http-403',
    });
  });
});

describe('a deferred row is neither red nor resolved', () => {
  const deferredObservation = {
    ok: false,
    deferred: true,
    reason: 'github-quota-deferred',
  };

  it('reports the entry deferred and keeps the registry healthy', () => {
    const report = evaluateLiveness(
      only('lanes-clock:spend-guard'),
      new Map([['lanes-clock:spend-guard', deferredObservation]]),
      NOW
    );
    expect(report.results[0]).toMatchObject({
      id: 'lanes-clock:spend-guard',
      status: 'deferred',
      reason: 'github-quota-deferred',
    });
    expect(report.status).toBe('healthy');
  });

  it('files no red decision and flips no green decision', () => {
    const report = evaluateLiveness(
      only('lanes-clock:spend-guard'),
      new Map([['lanes-clock:spend-guard', deferredObservation]]),
      NOW
    );
    expect(livenessDecisions(report)).toEqual([]);
    const fingerprint = livenessFingerprint('lanes-clock:spend-guard');
    expect(livenessDecisions(report, { [fingerprint]: 'red' })).toEqual([]);
  });

  it('still files red for a genuinely silent spend-guard', () => {
    const report = evaluateLiveness(
      only('lanes-clock:spend-guard'),
      new Map([
        [
          'lanes-clock:spend-guard',
          {
            ok: true,
            lastProofAt: iso(400),
            reason: 'no-heartbeat-recorded',
          },
        ],
      ]),
      NOW
    );
    expect(report.results[0]).toMatchObject({ status: 'stale' });
    expect(livenessDecisions(report)[0]).toMatchObject({ action: 'red' });
  });

  it('preserves the persisted alert state for a deferred row', () => {
    const fingerprint = livenessFingerprint('lanes-clock:spend-guard');
    expect(alertStateFor('fresh')).toBe('green');
    expect(alertStateFor('stale')).toBe('red');
    expect(alertStateFor('unknown')).toBe('red');
    expect(alertStateFor('deferred', 'red')).toBe('red');
    expect(alertStateFor('deferred', 'green')).toBe('green');
    expect(alertStateFor('deferred')).toBe('unknown');
    expect(fingerprint).toBe('automation-liveness-lanes-clock-spend-guard');
  });
});

describe('quota-defer CI admission', () => {
  it.each([
    'scripts/automation-liveness.mjs',
    'scripts/lib/github-json-read.mjs',
    'scripts/lib/automation-registry.mjs',
    'scripts/lib/__tests__/automation-liveness-quota-defer.test.mjs',
  ])('runs the quota-defer suite when %s changes', path => {
    for (const event of ['pull_request', 'merge_group', 'push']) {
      const guard = selectSourceGuards(event, [path]).find(
        candidate => candidate.id === 'automation-registry'
      );
      const file =
        'scripts/lib/__tests__/automation-liveness-quota-defer.test.mjs';
      const refs = mapTestReferences(
        [{ source: 'automation-registry', text: guard?.command ?? '' }],
        [file]
      );
      expect(refs.get(file)?.has('automation-registry')).toBe(true);
    }
  });
});

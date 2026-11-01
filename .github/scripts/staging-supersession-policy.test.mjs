import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decideNonWebSupersession,
  legacyNonWebSupersession,
  PRODUCTION_BUILD_INFO_URL,
  productionStaleness,
  resolveNonWebSupersession,
  STAGING_BUILD_INFO_URL,
} from './staging-supersession-policy.mjs';

function like(actual, expected) {
  for (const [key, value] of Object.entries(expected))
    assert.deepEqual(actual[key], value, key);
}

const sha = n => n.toString(16).padStart(40, '0');
const EXPECTED = sha(0xa);
const MAIN = sha(0xb);
const NEWER = sha(0xc);
const LIVE = sha(0x1);
const STAGED = sha(0x2);
const NOW = Date.parse('2026-10-29T06:00:00Z');
const minutesAgo = m => new Date(NOW - m * 60_000).toISOString();

function liveCompare(commits, oldestMinutes) {
  return {
    ahead_by: commits,
    commits: [{ commit: { committer: { date: minutesAgo(oldestMinutes) } } }],
  };
}

function resolve({
  staging = STAGED,
  stagingRelation = 'behind',
  live = LIVE,
  compare = liveCompare(12, 75),
  runs = [],
  receipts = new Set(),
  failing = new Set(),
} = {}) {
  const calls = [];
  const api = route => {
    calls.push(route);
    for (const needle of failing)
      if (route.includes(needle)) throw new Error('HTTP 502');
    if (route.includes(`/compare/${EXPECTED}...${staging}`))
      return { status: stagingRelation };
    if (route.includes(`/compare/${staging}...${MAIN}`))
      return { status: 'ahead' };
    if (route.includes(`/compare/${live}...${MAIN}`)) return compare;
    if (route.includes(`/compare/${EXPECTED}...${NEWER}`))
      return { status: 'ahead' };
    if (route.includes(`/compare/${NEWER}...${MAIN}`))
      return { status: 'ahead' };
    if (route.includes('/actions/workflows/ci.yml/runs'))
      return { workflow_runs: runs };
    if (route.includes('/actions/artifacts?name=')) {
      const name = route.split('name=')[1].split('&')[0];
      return {
        artifacts: receipts.has(name) ? [{ name, expired: false }] : [],
      };
    }
    throw new Error(`unexpected ${route}`);
  };
  const fetchJson = url => {
    if (failing.has(url)) throw new Error('fetch failed');
    if (url === STAGING_BUILD_INFO_URL) return { commitSha: staging };
    if (url === PRODUCTION_BUILD_INFO_URL) return { commitSha: live };
    throw new Error(url);
  };
  const result = resolveNonWebSupersession({
    repository: 'JovieInc/Jovie',
    expectedSha: EXPECTED,
    currentMainSha: MAIN,
    sourceCiRunId: '100',
    nowMs: NOW,
    api,
    fetchJson,
  });
  return { result, calls };
}

const greenRun = {
  id: 101,
  run_attempt: 1,
  head_sha: NEWER,
  head_branch: 'main',
  path: '.github/workflows/ci.yml',
  conclusion: 'success',
};

describe('production staleness', () => {
  const stale = (commits, minutes) =>
    productionStaleness({
      liveSha: LIVE,
      compare: liveCompare(commits, minutes),
      nowMs: NOW,
    }).stale;

  it('is fresh inside both bounds and stale past either', () => {
    assert.equal(stale(3, 20), false);
    assert.equal(stale(3, 31), true);
    assert.equal(stale(10, 5), true);
    assert.equal(stale(0, 500), false);
  });

  it('treats unreadable evidence as stale so green work is never discarded on a guess', () => {
    assert.equal(productionStaleness({ liveSha: '', nowMs: NOW }).stale, true);
    assert.equal(
      productionStaleness({ liveSha: LIVE, compare: {}, nowMs: NOW }).stale,
      true
    );
  });
});

describe('non-Web staging supersession', () => {
  it('reproduces 62cc40ae: stale production, newer main still in CI -> the green generation carries over', () => {
    const { result } = resolve();
    like(result, { outcome: 'carryover', replacementSha: null });
    like(result.evidence, { stale: true, unshippedCommits: 12 });
    // The pre-fix rule yielded to unfinished main and production skipped.
    assert.equal(
      legacyNonWebSupersession({ currentMainSha: MAIN }).outcome,
      'superseded'
    );
  });

  it('keeps supersession while production is fresh', () => {
    const { result } = resolve({ compare: liveCompare(2, 10) });
    like(result, { outcome: 'superseded', replacementSha: MAIN });
  });

  it('yields to a newer generation that already passed CI and sealed its receipt', () => {
    const { result } = resolve({
      runs: [greenRun],
      receipts: new Set([`product-lane-release-${NEWER}-1`]),
    });
    like(result, { outcome: 'superseded', replacementSha: NEWER });
  });

  it('does not count a successful CI run without a sealed receipt as green', () => {
    const { result } = resolve({ runs: [greenRun] });
    assert.equal(result.outcome, 'carryover');
  });

  it('yields when canonical staging already serves a newer generation on main', () => {
    const { result } = resolve({ staging: NEWER, stagingRelation: 'ahead' });
    like(result, { outcome: 'superseded', replacementSha: NEWER });
  });

  it('falls back to the old rule when staging lineage is unreadable', () => {
    const { result } = resolve({ failing: new Set([STAGING_BUILD_INFO_URL]) });
    like(result, { outcome: 'superseded', replacementSha: MAIN });
  });

  it('carries over when production freshness is unreadable', () => {
    const { result } = resolve({
      failing: new Set([PRODUCTION_BUILD_INFO_URL]),
    });
    assert.equal(result.outcome, 'carryover');
    assert.match(result.evidence.reason, /unreadable/);
  });

  it('carries over when the green-successor lookup is unreadable', () => {
    const { result } = resolve({
      failing: new Set(['/actions/workflows/ci.yml']),
    });
    assert.equal(result.outcome, 'carryover');
  });

  it('rejects malformed inputs instead of deciding', () => {
    assert.throws(
      () =>
        resolveNonWebSupersession({
          repository: 'JovieInc/Jovie',
          expectedSha: MAIN,
          currentMainSha: MAIN,
          sourceCiRunId: '100',
          nowMs: NOW,
          api: () => ({}),
          fetchJson: () => ({}),
        }),
      /ancestor generation/
    );
  });
});

// Starvation contract: a continuous stream of non-Web merges, each landing
// faster than one CI run, so main has always moved when a generation finishes.
// Staging is a FIFO of one; production is a FIFO lease that drains to the
// newest queued generation (release-lineage-gate.sh). Production must still
// advance within the bound.
function simulate(decide, { horizon = 12 * 60 } = {}) {
  const MERGE_EVERY = 6;
  const CI = 16;
  const STAGING_DECIDE = 1;
  const CARRYOVER = 2;
  const PRODUCTION = 25;
  const merged = i => i * MERGE_EVERY;
  const mainAt = t => Math.floor(t / MERGE_EVERY);
  let live = 0;
  let stagingFree = 0;
  let productionFree = 0;
  const productionQueue = [];
  const deploys = [];
  const staleAge = t => (mainAt(t) > live ? t - merged(live + 1) : 0);
  // Event-ordered pass (deterministic, one generation at a time).
  for (let i = 1; merged(i) + CI <= horizon; i++) {
    const start = Math.max(merged(i) + CI, stagingFree);
    const main = mainAt(start);
    let outcome = 'carryover';
    if (main !== i) {
      const unshipped = main - live;
      const age = staleAge(start);
      const greenSuccessor = merged(i + 1) + CI <= start ? i + 1 : null;
      outcome = decide({
        currentMainSha: main,
        stagingRelation: 'ancestor',
        stagingSha: null,
        staleness: productionStaleness({
          liveSha: LIVE,
          compare: liveCompare(unshipped, age),
          nowMs: NOW,
        }),
        greenSuccessorSha: greenSuccessor,
      }).outcome;
    }
    stagingFree =
      start + (outcome === 'carryover' ? CARRYOVER : STAGING_DECIDE);
    if (outcome === 'carryover') productionQueue.push({ i, at: stagingFree });
    // Production FIFO: run queued work that arrived before the next staging decision.
    while (productionQueue.length && productionQueue[0].at <= stagingFree) {
      const head = productionQueue.shift();
      const begin = Math.max(head.at, productionFree);
      if (productionQueue.some(q => q.at <= begin)) {
        productionFree = begin + 1; // yield to the newest queued generation
        continue;
      }
      productionFree = begin + PRODUCTION;
      if (head.i > live) {
        live = head.i;
        deploys.push(productionFree);
      }
    }
  }
  const maxGap = deploys.reduce(
    (gap, at, n) => Math.max(gap, at - (n ? deploys[n - 1] : 0)),
    deploys.length ? 0 : horizon
  );
  return { deploys: deploys.length, maxGap, live };
}

const BOUND_MINUTES = 90;

function assertProductionAdvances(decide) {
  const { deploys, maxGap } = simulate(decide);
  if (deploys === 0 || maxGap > BOUND_MINUTES)
    throw new Error(
      `production starved: ${deploys} deploy(s), longest gap ${maxGap} min (bound ${BOUND_MINUTES})`
    );
  return { deploys, maxGap };
}

describe('supersession starvation contract', () => {
  it('advances production within the bound under a continuous merge stream', () => {
    const { deploys, maxGap } = assertProductionAdvances(
      decideNonWebSupersession
    );
    assert.ok(deploys > 5, `deploys=${deploys}`);
    assert.ok(maxGap <= BOUND_MINUTES, `maxGap=${maxGap}`);
  });

  it('deliberate red: the pre-fix rule never ships under the same stream', () => {
    assert.throws(
      () => assertProductionAdvances(legacyNonWebSupersession),
      /production starved: 0 deploy/
    );
  });
});

describe('CLI transport', () => {
  it('reads evidence through gh (or the hold wrapper) and curl', async () => {
    const { mkdtempSync, writeFileSync, chmodSync, rmSync } = await import(
      'node:fs'
    );
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const { runCli } = await import('./staging-supersession-policy.mjs');
    const bin = mkdtempSync(join(tmpdir(), 'supersession-cli-'));
    const compare = JSON.stringify(liveCompare(12, 75));
    writeFileSync(
      join(bin, 'curl'),
      `#!/bin/sh\ncase "$*" in *staging.jov.ie*) echo '{"commitSha":"${STAGED}"}';; *) echo '{"commitSha":"${LIVE}"}';; esac\n`
    );
    writeFileSync(
      join(bin, 'gh'),
      `#!/bin/sh\ncase "$2" in *compare/${EXPECTED}...${STAGED}*) echo '{"status":"behind"}';; *compare/${LIVE}...*) echo '${compare}';; *ci.yml/runs*) echo '{"workflow_runs":[]}';; *) exit 1;; esac\n`
    );
    chmodSync(join(bin, 'curl'), 0o755);
    chmodSync(join(bin, 'gh'), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path}`;
    try {
      const env = {
        REPOSITORY: 'JovieInc/Jovie',
        EXPECTED_SHA: EXPECTED,
        CURRENT_MAIN_SHA: MAIN,
        SOURCE_CI_RUN_ID: '100',
      };
      like(runCli(env), { outcome: 'carryover' });
      writeFileSync(join(bin, 'hold.sh'), 'shift; exec gh api "$@"\n');
      like(runCli({ ...env, GH_API_HOLD_SCRIPT: join(bin, 'hold.sh') }), {
        outcome: 'carryover',
      });
    } finally {
      process.env.PATH = path;
      rmSync(bin, { recursive: true, force: true });
    }
  });
});

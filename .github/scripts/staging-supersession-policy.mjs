#!/usr/bin/env node
// Anti-starvation rule for non-Web staging generations (2026-10-29).
//
// A non-Web generation (CI green, Web lane not selected) used to be marked
// `superseded` the moment main had moved past it, naming current main as its
// replacement whether or not that newer generation had finished CI. With
// merges landing faster than one CI run (~7 merges/hour against ~15+ min of
// CI), main has always moved by the time a generation finishes. Every finished
// generation then yielded to an unfinished one and production stayed on
// 836f596a while main moved on (production-controller run 40825218725:
// "62cc40ae… finished as superseded… production release skipped").
//
// Rule: when production is stale, a finished, green generation does not yield
// to a newer generation that has not finished. Supersession still applies when
//   - canonical staging already serves a newer generation on main's lineage,
//   - production is fresh (the old behaviour), or
//   - a newer generation on main's lineage has already passed CI and sealed
//     its release receipt (it is green, so it stages next).
// Otherwise this generation carries over. Every later staging and production
// gate (evidence, attestation, canary, smoke, lineage) still runs unchanged.
// Unreadable staging evidence falls back to the old rule; unreadable
// production freshness counts as stale. Neither path can skip a gate.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const STALE_AFTER_SECONDS = 1800;
export const STALE_AFTER_COMMITS = 10;
export const SUCCESSOR_SCAN_LIMIT = 10;
export const PRODUCTION_BUILD_INFO_URL = 'https://jov.ie/api/health/build-info';
export const STAGING_BUILD_INFO_URL =
  'https://staging.jov.ie/api/health/build-info';
const SHA = /^[0-9a-f]{40}$/;
const ID = /^[1-9][0-9]*$/;

/** How long main has carried commits production lacks; unknown counts as stale. */
export function productionStaleness({
  liveSha,
  compare,
  nowMs,
  staleAfterSeconds = STALE_AFTER_SECONDS,
  staleAfterCommits = STALE_AFTER_COMMITS,
}) {
  const unknown = reason => ({
    stale: true,
    reason,
    unshippedCommits: null,
    unshippedAgeSeconds: null,
  });
  if (!SHA.test(liveSha ?? ''))
    return unknown('live production build-info is unreadable');
  const commits = compare?.ahead_by;
  if (!Number.isSafeInteger(commits) || commits < 0)
    return unknown('the unshipped range behind production is unreadable');
  if (commits === 0)
    return {
      stale: false,
      reason: 'production serves current main',
      unshippedCommits: 0,
      unshippedAgeSeconds: 0,
    };
  const oldest = Date.parse(compare.commits?.[0]?.commit?.committer?.date);
  if (!Number.isFinite(oldest))
    return unknown('the oldest unshipped commit time is unreadable');
  const age = Math.max(0, Math.floor((nowMs - oldest) / 1000));
  const stale = age >= staleAfterSeconds || commits >= staleAfterCommits;
  return {
    stale,
    reason: `production lacks ${commits} commit(s), oldest ${age}s (stale at ${staleAfterSeconds}s or ${staleAfterCommits} commits)`,
    unshippedCommits: commits,
    unshippedAgeSeconds: age,
  };
}

/**
 * Pure decision. `stagingRelation` is canonical staging's relation to the
 * expected SHA: `descendant` (with `stagingSha` on main), `same`, `ancestor`,
 * or `unknown`.
 */
export function decideNonWebSupersession({
  currentMainSha,
  stagingRelation,
  stagingSha,
  staleness,
  greenSuccessorSha,
}) {
  if (stagingRelation === 'descendant')
    return {
      outcome: 'superseded',
      replacementSha: stagingSha,
      reason: 'a newer generation is already live on canonical staging',
    };
  if (stagingRelation === 'unknown')
    return {
      outcome: 'superseded',
      replacementSha: currentMainSha,
      reason:
        'canonical staging lineage is unreadable; keeping the pre-2026-10-29 rule',
    };
  if (!staleness.stale)
    return {
      outcome: 'superseded',
      replacementSha: currentMainSha,
      reason: `production is fresh (${staleness.reason})`,
    };
  if (greenSuccessorSha)
    return {
      outcome: 'superseded',
      replacementSha: greenSuccessorSha,
      reason: `production is stale (${staleness.reason}) but newer generation ${greenSuccessorSha} already passed CI`,
    };
  return {
    outcome: 'carryover',
    replacementSha: null,
    reason: `production is stale (${staleness.reason}) and no newer generation has finished CI; this green generation keeps going`,
  };
}

/** The rule before 2026-10-29, kept only as the deliberate-red baseline. */
export function legacyNonWebSupersession({ currentMainSha }) {
  return {
    outcome: 'superseded',
    replacementSha: currentMainSha,
    reason: 'main advanced',
  };
}

function attempt(read) {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/** Gather evidence through injected readers, then decide. Never throws on unreadable evidence. */
export function resolveNonWebSupersession({
  repository,
  expectedSha,
  currentMainSha,
  sourceCiRunId,
  nowMs,
  api,
  fetchJson,
}) {
  if (
    repository !== 'JovieInc/Jovie' ||
    !SHA.test(expectedSha ?? '') ||
    !SHA.test(currentMainSha ?? '') ||
    expectedSha === currentMainSha ||
    !ID.test(String(sourceCiRunId ?? ''))
  )
    throw new Error(
      'non-Web supersession needs an exact ancestor generation of current main'
    );
  const status = range =>
    attempt(() => api(`repos/${repository}/compare/${range}`)?.status);

  let stagingRelation = 'unknown';
  const stagingSha = attempt(
    () => fetchJson(STAGING_BUILD_INFO_URL)?.commitSha
  );
  if (SHA.test(stagingSha ?? '')) {
    if (stagingSha === expectedSha) stagingRelation = 'same';
    else {
      const relation = status(`${expectedSha}...${stagingSha}`);
      if (relation === 'behind') stagingRelation = 'ancestor';
      else if (relation === 'ahead') {
        const onMain = status(`${stagingSha}...${currentMainSha}`);
        if (onMain === 'ahead' || onMain === 'identical')
          stagingRelation = 'descendant';
      }
    }
  }

  const liveSha = attempt(
    () => fetchJson(PRODUCTION_BUILD_INFO_URL)?.commitSha
  );
  const compare = SHA.test(liveSha ?? '')
    ? attempt(() =>
        api(`repos/${repository}/compare/${liveSha}...${currentMainSha}`)
      )
    : undefined;
  const staleness = productionStaleness({ liveSha, compare, nowMs });

  let greenSuccessorSha = null;
  if (stagingRelation !== 'descendant' && staleness.stale) {
    const runs = attempt(
      () =>
        api(
          `repos/${repository}/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=100`
        )?.workflow_runs
    );
    const candidates = (Array.isArray(runs) ? runs : [])
      .filter(
        run =>
          Number(run?.id) > Number(sourceCiRunId) &&
          run.head_branch === 'main' &&
          run.path === '.github/workflows/ci.yml' &&
          run.conclusion === 'success' &&
          SHA.test(run.head_sha ?? '') &&
          ID.test(String(run.run_attempt))
      )
      .sort((a, b) => b.id - a.id)
      .slice(0, SUCCESSOR_SCAN_LIMIT);
    for (const run of candidates) {
      if (run.head_sha === expectedSha) continue;
      if (status(`${expectedSha}...${run.head_sha}`) !== 'ahead') continue;
      const onMain = status(`${run.head_sha}...${currentMainSha}`);
      if (onMain !== 'ahead' && onMain !== 'identical') continue;
      // Green means release-authorized: CI sealed its product-lane receipt.
      const receipt = `product-lane-release-${run.head_sha}-${run.run_attempt}`;
      const artifacts = attempt(
        () =>
          api(
            `repos/${repository}/actions/artifacts?name=${receipt}&per_page=100`
          )?.artifacts
      );
      if (
        Array.isArray(artifacts) &&
        artifacts.some(a => a?.name === receipt && a.expired === false)
      ) {
        greenSuccessorSha = run.head_sha;
        break;
      }
    }
  }

  return {
    ...decideNonWebSupersession({
      currentMainSha,
      stagingRelation,
      stagingSha: stagingSha ?? null,
      staleness,
      greenSuccessorSha,
    }),
    evidence: {
      stagingSha: SHA.test(stagingSha ?? '') ? stagingSha : null,
      stagingRelation,
      liveSha: SHA.test(liveSha ?? '') ? liveSha : null,
      ...staleness,
      greenSuccessorSha,
    },
  };
}

function run(args) {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.status !== 0)
    throw new Error(`${args[0]} exited ${result.status}`);
  return result.stdout;
}

export function runCli(env = process.env) {
  const hold = env.GH_API_HOLD_SCRIPT;
  const api = route =>
    JSON.parse(run(hold ? ['bash', hold, 'api', route] : ['gh', 'api', route]));
  const fetchJson = url =>
    JSON.parse(
      run([
        'curl',
        '--fail',
        '--silent',
        '--connect-timeout',
        '5',
        '--max-time',
        '15',
        '-H',
        'Cache-Control: no-cache',
        url,
      ])
    );
  return resolveNonWebSupersession({
    repository: env.REPOSITORY,
    expectedSha: env.EXPECTED_SHA,
    currentMainSha: env.CURRENT_MAIN_SHA,
    sourceCiRunId: env.SOURCE_CI_RUN_ID,
    nowMs: Date.now(),
    api,
    fetchJson,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(runCli()));
  } catch (error) {
    console.error(
      `::error::Staging supersession policy failed: ${error.message}`
    );
    process.exitCode = 1;
  }
}

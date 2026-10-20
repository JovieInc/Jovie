#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PRODUCTION_BUILD_INFO_URL = 'https://jov.ie/api/health/build-info';
export const SHA_PATTERN = /^[0-9a-f]{40}$/;
export const LIVE_BIND_FETCH_TIMEOUT_MS = 15_000;

export const LIVE_BIND_REASONS = Object.freeze({
  liveBoundToMain: 'live_bound_to_main',
  skipSuccessUnbound: 'skip_success_unbound',
  invalidMainSha: 'invalid_main_sha',
  invalidLiveSha: 'invalid_live_sha',
  liveBuildInfoUnreadable: 'live_build_info_unreadable',
});

export const IN_FLIGHT_RUN_STATUSES = Object.freeze([
  'queued',
  'in_progress',
  'waiting',
  'requested',
  'pending',
]);

export const SUPERSEDE_DEFER_REASONS = Object.freeze({
  supersedingRunInFlight: 'superseding_run_in_flight',
  noSupersedingRunInFlight: 'no_superseding_run_in_flight',
  inFlightCheckUnavailable: 'in_flight_check_unavailable',
  inFlightCheckFailed: 'in_flight_check_failed',
});

function exactSha(value) {
  return typeof value === 'string' && SHA_PATTERN.test(value) ? value : null;
}

export function classifyLiveProductionBind({ liveSha, mainSha }) {
  const currentMain = exactSha(mainSha);
  if (!currentMain) {
    return {
      bound: false,
      reason: LIVE_BIND_REASONS.invalidMainSha,
      liveSha: exactSha(liveSha),
      mainSha: typeof mainSha === 'string' ? mainSha : null,
    };
  }

  const live = exactSha(liveSha);
  if (!live) {
    return {
      bound: false,
      reason: LIVE_BIND_REASONS.invalidLiveSha,
      liveSha: typeof liveSha === 'string' ? liveSha : null,
      mainSha: currentMain,
    };
  }

  if (live === currentMain) {
    return {
      bound: true,
      reason: LIVE_BIND_REASONS.liveBoundToMain,
      liveSha: live,
      mainSha: currentMain,
    };
  }

  return {
    bound: false,
    reason: LIVE_BIND_REASONS.skipSuccessUnbound,
    liveSha: live,
    mainSha: currentMain,
  };
}

export async function fetchLiveCommitSha({
  fetchImpl = fetch,
  timeoutMs = LIVE_BIND_FETCH_TIMEOUT_MS,
  url = PRODUCTION_BUILD_INFO_URL,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
      signal: controller.signal,
    });
    if (!response?.ok) {
      throw new Error(
        `Live production build-info failed: HTTP ${response?.status ?? 'unknown'}`
      );
    }
    const payload = await response.json();
    const liveSha = exactSha(payload?.commitSha);
    if (!liveSha) {
      throw new Error('Live production build-info omitted an exact commitSha.');
    }
    return liveSha;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Live production build-info timed out after ${timeoutMs}ms`
      );
    }
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timeout);
  }
}

function parseArgs(argv) {
  const args = {
    fixture: null,
    liveSha: null,
    mainSha: process.env.MAIN_SHA ?? '',
    url: process.env.PRODUCTION_BUILD_INFO_URL || PRODUCTION_BUILD_INFO_URL,
    allowInFlightSupersede: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--fixture' && value) {
      args.fixture = value;
      index += 1;
    } else if (flag === '--main-sha' && value) {
      args.mainSha = value;
      index += 1;
    } else if (flag === '--live-sha' && value) {
      args.liveSha = value;
      index += 1;
    } else if (flag === '--build-info-url' && value) {
      args.url = value;
      index += 1;
    } else if (flag === '--allow-in-flight-supersede') {
      args.allowInFlightSupersede = true;
    }
  }

  return args;
}

function loadFixture(path) {
  const fixture = JSON.parse(readFileSync(path, 'utf8'));
  return {
    liveSha: exactSha(fixture?.live?.commitSha) ?? exactSha(fixture?.liveSha),
    mainSha: exactSha(fixture?.mainSha) ?? exactSha(fixture?.originMainSha),
  };
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   liveSha?: string | null,
 *   mainSha?: string | null,
 *   timeoutMs?: number,
 *   url?: string,
 * }} [options]
 */
export async function assertLiveProductionBind({
  fetchImpl = fetch,
  liveSha = null,
  mainSha,
  timeoutMs = LIVE_BIND_FETCH_TIMEOUT_MS,
  url = PRODUCTION_BUILD_INFO_URL,
} = {}) {
  const currentMain = exactSha(mainSha);
  if (!currentMain) {
    return classifyLiveProductionBind({ liveSha, mainSha });
  }

  if (liveSha != null) {
    return classifyLiveProductionBind({ liveSha, mainSha: currentMain });
  }

  try {
    const observed = await fetchLiveCommitSha({ fetchImpl, timeoutMs, url });
    return classifyLiveProductionBind({
      liveSha: observed,
      mainSha: currentMain,
    });
  } catch (error) {
    return {
      bound: false,
      reason: LIVE_BIND_REASONS.liveBuildInfoUnreadable,
      liveSha: null,
      mainSha: currentMain,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const GITHUB_API_BASE_URL = 'https://api.github.com';
export const CONTROLLER_WORKFLOW_PATH = 'production-controller.yml';

/**
 * When a generation is superseded before marker preservation, live jov.ie
 * legitimately lags origin/main while a newer controller generation in the
 * same forward lineage is still proving the bind. Main can advance again
 * before that generation starts, so it need not target the latest main.
 * Deferring is non-mutating (finalize only runs for is_current or
 * canonical_verified runs), so an in-flight superseding run is a safe
 * skip-success owner. Any other state
 * keeps the fail-closed posture (JOV-5458): nothing owns the bind proof, so
 * the run must stay red.
 *
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   mainSha?: string | null,
 *   liveSha?: string | null,
 *   expectedSha?: string | null,
 *   repo?: string,
 *   excludeRunId?: string | number | null,
 *   token?: string,
 *   apiBaseUrl?: string,
 *   workflowPath?: string,
 * }} [options]
 */
export async function deferToInFlightSupersede({
  fetchImpl = fetch,
  mainSha,
  liveSha,
  expectedSha = process.env.EXPECTED_SHA ?? '',
  repo = process.env.GITHUB_REPOSITORY ?? '',
  excludeRunId = process.env.GITHUB_RUN_ID ?? '',
  token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '',
  apiBaseUrl = GITHUB_API_BASE_URL,
  workflowPath = CONTROLLER_WORKFLOW_PATH,
} = {}) {
  const currentMain = exactSha(mainSha);
  const live = exactSha(liveSha);
  const expected = exactSha(expectedSha);
  const currentRunId = Number(excludeRunId);
  if (
    !currentMain ||
    !live ||
    !expected ||
    !REPO_PATTERN.test(repo) ||
    !Number.isSafeInteger(currentRunId) ||
    currentRunId <= 0
  ) {
    return {
      deferred: false,
      reason: SUPERSEDE_DEFER_REASONS.inFlightCheckUnavailable,
    };
  }

  try {
    // One deadline bounds the listing and all ancestry reads; no polling.
    const signal = AbortSignal.timeout(LIVE_BIND_FETCH_TIMEOUT_MS);
    const api = async path => {
      const response = await fetchImpl(`${apiBaseUrl}/repos/${repo}/${path}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal,
      });
      if (!response?.ok) {
        throw new Error(
          `Production Controller evidence failed: HTTP ${response?.status ?? 'unknown'}`
        );
      }
      return response.json();
    };
    const payload = await api(
      `actions/workflows/${workflowPath}/runs?branch=main&event=workflow_run&per_page=30`
    );
    if (!Array.isArray(payload?.workflow_runs)) {
      throw new Error('Production Controller run listing is malformed.');
    }
    const comparisons = new Map();
    const ancestor = async (base, head) => {
      if (base === head) return true;
      const range = `${base}...${head}`;
      if (!comparisons.has(range)) {
        const comparison = await api(`compare/${range}`);
        comparisons.set(range, comparison?.status === 'ahead');
      }
      return comparisons.get(range);
    };
    for (const run of payload.workflow_runs) {
      if (
        !Number.isSafeInteger(run?.id) ||
        run.id <= currentRunId ||
        run.head_branch !== 'main' ||
        run.event !== 'workflow_run' ||
        !IN_FLIGHT_RUN_STATUSES.includes(run.status)
      ) {
        continue;
      }
      // workflow_run head_sha is the policy checkout. The existing run-name
      // contract identifies the release SHA carried from the staging receipt.
      const generation =
        typeof run.display_title === 'string'
          ? run.display_title.match(
              /^Production Controller ([0-9a-f]{40}) from CI [1-9][0-9]* attempt [1-9][0-9]*$/
            )?.[1]
          : null;
      if (
        !generation ||
        generation === expected ||
        !(await ancestor(live, currentMain)) ||
        !(await ancestor(expected, generation)) ||
        !(await ancestor(generation, currentMain))
      ) {
        continue;
      }
      return {
        deferred: true,
        reason: SUPERSEDE_DEFER_REASONS.supersedingRunInFlight,
        runIds: [run.id],
      };
    }
    return {
      deferred: false,
      reason: SUPERSEDE_DEFER_REASONS.noSupersedingRunInFlight,
    };
  } catch (error) {
    return {
      deferred: false,
      reason: SUPERSEDE_DEFER_REASONS.inFlightCheckFailed,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function failUnbound(result) {
  const live = result.liveSha ?? '<unreadable>';
  const main = result.mainSha ?? '<invalid>';
  const detail = result.detail ? ` (${result.detail})` : '';
  console.error(
    `::error::Skip-promote / superseded generation cannot succeed while live jov.ie commitSha ${live} ≠ origin/main ${main} [${result.reason}]${detail}`
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fromFixture = args.fixture ? loadFixture(args.fixture) : null;
  const result = await assertLiveProductionBind({
    liveSha: fromFixture?.liveSha ?? args.liveSha,
    mainSha: fromFixture?.mainSha ?? args.mainSha,
    url: args.url,
  });
  if (!result.bound) {
    if (
      args.allowInFlightSupersede &&
      result.reason === LIVE_BIND_REASONS.skipSuccessUnbound
    ) {
      const deferral = await deferToInFlightSupersede({
        liveSha: result.liveSha,
        mainSha: result.mainSha,
      });
      if (deferral.deferred) {
        console.log(
          `Live jov.ie lags origin/main ${result.mainSha} but superseding Production Controller run(s) ${(deferral.runIds ?? []).join(', ')} own the bind proof; superseded generation exits non-mutating.`
        );
        process.stdout.write(
          `${JSON.stringify({ ...result, deferred: true, deferral })}\n`
        );
        return;
      }
      console.error(
        `::warning::No superseding Production Controller run owns the live bind for ${result.mainSha} (${deferral.reason}${
          deferral.detail ? `: ${deferral.detail}` : ''
        }).`
      );
    }
    failUnbound(result);
  }
  console.log(
    `Live production is bound to origin/main ${result.mainSha}; skip-success is non-mutating.`
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(
      `::error::Live production bind check crashed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  });
}

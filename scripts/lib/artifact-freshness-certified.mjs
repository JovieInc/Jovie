/**
 * Production Verified + desktop-path relevance for artifact freshness.
 *
 * api-budget: github-actions-token 30/hr - one workflow runs page plus jobs +
 * artifacts pages for Production Verified candidates until a marker matches
 */
import { execFileSync } from 'node:child_process';
import { GITHUB_API } from '../../packages/api-client/github.ts';

export const DESKTOP_PRODUCTION_PATHS = Object.freeze([
  'VERSION',
  '.github/workflows/desktop-release.yml',
  'apps/desktop/build',
  'apps/desktop/electron-builder.yml',
  'apps/desktop/package.json',
  'apps/desktop/scripts/apply-electron-fuses.cjs',
  'apps/desktop/scripts/generate-dmg-background.mjs',
  'apps/desktop/scripts/prepare-icons.mjs',
  'apps/desktop/scripts/sync-version.mjs',
  'apps/desktop/scripts/write-env.mjs',
  'apps/desktop/src',
  'pnpm-lock.yaml',
  'scripts/desktop-release-assets.mjs',
]);

const FULL_SHA = /^[0-9a-f]{40}$/;
const DEFAULT_REPO = 'JovieInc/Jovie';
const PRODUCTION_CONTROLLER_WORKFLOW = 'production-controller.yml';
const PRODUCTION_VERIFIED_JOB = 'Production Verified';
/** Same contract as production-marker-recovery / JOV-9998. */
const ROLLBACK_JOB_SUFFIX = 'Centralized production rollback';
/**
 * run-name: Production Controller ${{ github.event.workflow_run.display_title }}
 * CI display_title carries the generation SHA; tip head_sha can advance past it.
 */
const CONTROLLER_TITLE =
  /^Production Controller ([0-9a-f]{40}) from CI [1-9][0-9]* attempt [1-9][0-9]*$/i;

/**
 * Generation SHA from production-controller display_title (not head_sha).
 * @param {{
 *   readonly display_title?: unknown;
 *   readonly head_sha?: unknown;
 * } | null | undefined} run
 * @returns {string | null}
 */
export function productionControllerGenerationSha(run) {
  const title = typeof run?.display_title === 'string' ? run.display_title : '';
  const match = CONTROLLER_TITLE.exec(title);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Marker upload only happens when finalize sets verified=true
 * (production-controller.yml). Superseded-before-promotion succeeds the job
 * with verified=false and uploads no marker.
 * @param {ReadonlyArray<{ readonly name?: unknown; readonly expired?: unknown }>} artifacts
 * @param {string} generationSha
 */
export function hasProductionVerifiedMarker(artifacts, generationSha) {
  if (!FULL_SHA.test(generationSha)) return false;
  const names = new Set([
    `production-generation-verified-${generationSha}`,
    `production-generation-verified-recovery-${generationSha}`,
  ]);
  const list = Array.isArray(artifacts) ? artifacts : [];
  return list.some(
    artifact =>
      artifact?.expired !== true &&
      typeof artifact?.name === 'string' &&
      names.has(artifact.name)
  );
}

/**
 * Production Verified succeeded and centralized rollback was skipped.
 * Not sufficient alone — superseded-before-promotion also matches this and
 * leaves verified=false (see isProductionVerifiedJobSet).
 * @param {ReadonlyArray<{ readonly name?: unknown; readonly conclusion?: unknown }>} jobs
 */
export function isProductionVerifiedJobConclusions(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const verified = list.some(
    job =>
      job?.name === PRODUCTION_VERIFIED_JOB && job?.conclusion === 'success'
  );
  if (!verified) return false;
  const rollbacks = list.filter(
    job =>
      typeof job?.name === 'string' && job.name.endsWith(ROLLBACK_JOB_SUFFIX)
  );
  return rollbacks.length === 1 && rollbacks[0]?.conclusion === 'skipped';
}

/**
 * Certified only when job conclusions pass AND a verified-generation marker
 * artifact exists for the generation SHA (promotion proof from
 * production-controller.yml finalize verified=true).
 * @param {{
 *   readonly jobs: ReadonlyArray<{ readonly name?: unknown; readonly conclusion?: unknown }>;
 *   readonly artifacts: ReadonlyArray<{ readonly name?: unknown; readonly expired?: unknown }>;
 *   readonly generationSha: string;
 * }} input
 */
export function isProductionVerifiedJobSet(input) {
  return (
    isProductionVerifiedJobConclusions(input.jobs) &&
    hasProductionVerifiedMarker(input.artifacts, input.generationSha)
  );
}

/**
 * @param {string} publishedSha
 * @param {string} certifiedSha
 * @param {{ readonly execFileSync?: (...args: any[]) => string }} [deps]
 */
export function desktopRelevantBetween(publishedSha, certifiedSha, deps = {}) {
  if (!FULL_SHA.test(publishedSha) || !FULL_SHA.test(certifiedSha)) {
    return null;
  }
  if (publishedSha === certifiedSha) return false;
  const run = deps.execFileSync ?? execFileSync;
  try {
    const out = run(
      'git',
      [
        'diff',
        '--name-only',
        '-z',
        `${publishedSha}...${certifiedSha}`,
        '--',
        ...DESKTOP_PRODUCTION_PATHS,
      ],
      { encoding: 'utf8' }
    );
    return out.split('\0').filter(Boolean).length > 0;
  } catch {
    return null;
  }
}

/**
 * Production Verified lives on production-controller.yml, which triggers on
 * workflow_run (not push). Query that workflow's runs — never event=push.
 * Certify only when the job set passes AND a verified-generation marker exists;
 * use display_title generation SHA (not tip head_sha).
 * @param {{
 *   readonly repo?: string;
 *   readonly token?: string | null;
 *   readonly fetchImpl?: (input: any, init?: any) => Promise<any>;
 * }} [input]
 */
export async function fetchLatestProductionVerifiedSha(input = {}) {
  const repo = input.repo ?? DEFAULT_REPO;
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'jovie-artifact-freshness',
  };
  const token = input.token ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const url = `${GITHUB_API}/repos/${repo}/actions/workflows/${PRODUCTION_CONTROLLER_WORKFLOW}/runs?branch=main&status=completed&per_page=30`;
    const response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      return {
        status: 'unknown',
        reason: `Production Verified lookup returned ${response.status}`,
      };
    }
    const body = await response.json();
    const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
    for (const run of runs) {
      // Do not require run.conclusion === 'success': post-verification jobs
      // can fail after Production Verified (JOV-9998) without un-certifying.
      const generationSha = productionControllerGenerationSha(run);
      if (!generationSha) continue;

      const jobsUrl = `${GITHUB_API}/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`;
      const jobsResponse = await fetchImpl(jobsUrl, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      // Non-OK jobs fetch is incomplete observation — never skip to an older
      // verified SHA (that can premature-resolve Summer when published matches).
      if (!jobsResponse.ok) {
        return {
          status: 'unknown',
          reason: `Production Verified jobs lookup returned ${jobsResponse.status}`,
        };
      }
      const jobsBody = await jobsResponse.json();
      const jobs = Array.isArray(jobsBody?.jobs) ? jobsBody.jobs : [];
      if (!isProductionVerifiedJobConclusions(jobs)) continue;

      const artifactsUrl = `${GITHUB_API}/repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`;
      const artifactsResponse = await fetchImpl(artifactsUrl, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!artifactsResponse.ok) {
        return {
          status: 'unknown',
          reason: `Production Verified artifacts lookup returned ${artifactsResponse.status}`,
        };
      }
      const artifactsBody = await artifactsResponse.json();
      const artifacts = Array.isArray(artifactsBody?.artifacts)
        ? artifactsBody.artifacts
        : [];
      // Job success without marker = superseded/unpromoted (verified=false).
      if (!isProductionVerifiedJobSet({ jobs, artifacts, generationSha })) {
        continue;
      }
      return {
        status: 'known',
        sourceRevision: generationSha,
        at: run.updated_at ?? null,
        verified: true,
      };
    }
    return {
      status: 'unknown',
      reason: 'No recent successful Production Verified job on main.',
    };
  } catch (error) {
    return {
      status: 'unknown',
      reason: `Production Verified lookup failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

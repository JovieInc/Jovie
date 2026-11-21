/**
 * Production Verified + desktop-path relevance for artifact freshness.
 *
 * api-budget: github-actions-token 30/hr - desktop-release completion reconcile: one workflow runs page plus up to a few jobs pages for Production Verified
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
 * A controller run is certified when Production Verified succeeded and the
 * centralized rollback job was skipped — not when the whole workflow
 * conclusion is success. Post-verification jobs (changelog publish/staleness)
 * can fail without un-verifying production (JOV-9998).
 * @param {ReadonlyArray<{ readonly name?: unknown; readonly conclusion?: unknown }>} jobs
 */
export function isProductionVerifiedJobSet(jobs) {
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
      if (typeof run?.head_sha !== 'string' || !FULL_SHA.test(run.head_sha)) {
        continue;
      }
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
      if (isProductionVerifiedJobSet(jobs)) {
        return {
          status: 'known',
          sourceRevision: run.head_sha,
          at: run.updated_at ?? null,
          verified: true,
        };
      }
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

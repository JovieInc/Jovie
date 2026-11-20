/**
 * Production Verified + desktop-path relevance for artifact freshness.
 */
import { execFileSync } from 'node:child_process';

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
const GITHUB_API = 'https://api.github.com';
const DEFAULT_REPO = 'JovieInc/Jovie';
const PRODUCTION_CONTROLLER_WORKFLOW = 'production-controller.yml';

/**
 * @param {string} publishedSha
 * @param {string} certifiedSha
 * @param {{ readonly execFileSync?: typeof execFileSync }} [deps]
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
 *
 * @param {{
 *   readonly repo?: string;
 *   readonly token?: string | null;
 *   readonly fetchImpl?: typeof fetch;
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
      if (run?.conclusion !== 'success') continue;
      if (typeof run?.head_sha !== 'string' || !FULL_SHA.test(run.head_sha)) {
        continue;
      }
      const jobsUrl = `${GITHUB_API}/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`;
      const jobsResponse = await fetchImpl(jobsUrl, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!jobsResponse.ok) continue;
      const jobsBody = await jobsResponse.json();
      const jobs = Array.isArray(jobsBody?.jobs) ? jobsBody.jobs : [];
      const verified = jobs.some(
        job =>
          job?.name === 'Production Verified' && job?.conclusion === 'success'
      );
      if (verified) {
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

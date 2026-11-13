/**
 * GitHub REST JSON reads for the liveness observers (split from
 * scripts/automation-liveness.mjs for its size-500 budget; no provider-host
 * literals live here — callers pass URLs, so the external-api guard ratchet
 * is untouched).
 *
 * readGithubJson recovers a denied Actions token: the token is the cheap
 * read, but it draws on the shared installation REST budget that runs dry
 * under load — automation-liveness run 43150125408 answered
 * `github-http-403` for a golden-path-nightly run list whose workflow was
 * green, filing a false P0 (JOV-11677). Jovie is public, so on a 403 retry
 * the same URL once without the token — the recovery readUnshippedRange in
 * scripts/automation-liveness.mjs already uses — so a denied or exhausted
 * credential cannot hide a readable run list. Any other failure, or a public
 * read that also fails, keeps the original failure so silence stays red.
 *
 * When a denial carries GitHub's own rate-limit evidence — the body text or
 * the x-ratelimit/retry-after headers, read by the one repo-wide classifier
 * (classifyGitHubFailure in scripts/lib/github-rate-limit.mjs) — the read is
 * QUOTA, not silence: automation-liveness run 43413778385 answered `API rate
 * limit exceeded for installation` (HTTP 403) on both legs while every
 * workflow was green, and the dead-man filed red for 28 critical loops
 * (JOV-9993). A quota denial returns `quota-deferred` (observers surface it
 * as `github-quota-deferred`): the run reports it, warns with the
 * github-quota-deferred marker, exits 75, and the next 20-minute bucket
 * re-reads — inside every critical loop's silence budget. A quota failure is
 * never a silence verdict, the same doctrine github-rate-limit.mjs already
 * applies to every other GITHUB_TOKEN consumer.
 *
 * landedOnMainAt moved here from scripts/automation-liveness.mjs (also its
 * size-500 budget): it is the same readJson/githubHeaders consumer.
 */
import { classifyGitHubFailure } from './github-rate-limit.mjs';

const TIMEOUT_MS = 10_000;
const BODY_SNIPPET_CHARS = 512;

/** The classifier's evidence from a denied response: status, headers, body. */
async function deniedEvidence(response) {
  let bodyText = '';
  try {
    bodyText = (await response.text()).slice(0, BODY_SNIPPET_CHARS);
  } catch {
    // The status stays the only evidence when the body will not read.
  }
  return {
    status: response.status,
    headers: response.headers ?? null,
    bodyText,
  };
}

/** Bounded JSON fetch: 200 is ok, any other status or transport is a reason. */
export async function readJson(fetchImpl, url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        ...headers,
      },
      signal: controller.signal,
    });
    if (response.status !== 200) {
      // A status alone cannot tell a quota denial from a permission one:
      // keep the classifier's evidence (body snippet + headers) on the read.
      return {
        ok: false,
        reason: `http-${response.status}`,
        ...(await deniedEvidence(response)),
      };
    }
    return { ok: true, body: await response.json() };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === 'AbortError' ? 'timeout' : 'transport',
    };
  } finally {
    clearTimeout(timer);
  }
}

export function githubHeaders(token) {
  return token
    ? { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
    : {};
}

/**
 * The rate-limit kind GitHub attached to a denied read, or null when the
 * denial carries no quota evidence (a permission answer). Reuses the one
 * repo-wide classifier so liveness defers exactly the failures every other
 * GITHUB_TOKEN consumer already defers.
 * @param {{ ok?: boolean, status?: number, headers?: any, bodyText?: string } | null | undefined} read
 * @returns {string | null}
 */
export function quotaKindOf(read) {
  if (!read || read.ok || (read.status !== 403 && read.status !== 429))
    return null;
  const classification = classifyGitHubFailure({
    status: read.status,
    message: read.bodyText ?? '',
    headers: read.headers ?? null,
  });
  return classification.retryable ? classification.kind : null;
}

/**
 * The rate-limit kind attached to a denied non-GET response (the GraphQL
 * observer's POST), or null without quota evidence; see quotaKindOf.
 * @param {Response} response
 * @returns {Promise<string | null>}
 */
export async function classifyDeniedResponse(response) {
  return quotaKindOf(await deniedEvidence(response));
}

/**
 * Run-list read for the workflow observers; see the module header. The
 * unauthenticated retry runs only when a token was used and only on a 403.
 */
export async function readGithubJson(url, { fetchImpl, token }) {
  const read = await readJson(fetchImpl, url, githubHeaders(token));
  if (read.ok) return read;
  if (token && read.reason === 'http-403') {
    const fallback = await readJson(fetchImpl, url, {});
    if (fallback.ok) return fallback;
    const recoveryQuotaKind = quotaKindOf(read) ?? quotaKindOf(fallback);
    if (recoveryQuotaKind)
      return {
        ok: false,
        reason: 'quota-deferred',
        quotaKind: recoveryQuotaKind,
      };
    return fallback;
  }
  // A 429, or a tokenless quota denial, defers too: a quota failure is never
  // a silence verdict, with or without a recovery read.
  const quotaKind = quotaKindOf(read);
  if (quotaKind) return { ok: false, reason: 'quota-deferred', quotaKind };
  return read;
}

const PUSH_RUNS_PAGE = 100;
const LANDING_SKEW_MS = 2 * 60_000;

/**
 * When a merge-queue squash commit reached main.
 *
 * Its committer date is the queue time, which can precede the fast-forward
 * onto main by hours. The earliest push-event run at or after that date is
 * the landing time. An unreadable or incomplete run list keeps the committer
 * date, so a real stall still alerts.
 */
export async function landedOnMainAt(
  repo,
  sha,
  committerDate,
  { fetchImpl, token, apiUrl }
) {
  const committerMs = Date.parse(committerDate ?? '');
  const base = `${apiUrl}/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&event=push&per_page=${PUSH_RUNS_PAGE}`;
  const headers = githubHeaders(token);
  const first = await readJson(fetchImpl, base, headers);
  if (!first.ok || !Array.isArray(first.body?.workflow_runs))
    return committerDate;
  let runs = first.body.workflow_runs;
  const total = Number(first.body.total_count);
  if (Number.isFinite(total) && total > runs.length) {
    const lastPage = Math.ceil(total / PUSH_RUNS_PAGE);
    const older = await readJson(
      fetchImpl,
      `${base}&page=${lastPage}`,
      headers
    );
    if (!older.ok || !Array.isArray(older.body?.workflow_runs))
      return committerDate;
    runs = older.body.workflow_runs;
  }
  const landedMs = runs
    .map(run => Date.parse(run?.created_at ?? ''))
    .filter(
      ms =>
        Number.isFinite(ms) &&
        (!Number.isFinite(committerMs) || ms + LANDING_SKEW_MS >= committerMs)
    )
    .reduce((min, ms) => Math.min(min, ms), Number.POSITIVE_INFINITY);
  return Number.isFinite(landedMs)
    ? new Date(landedMs).toISOString()
    : committerDate;
}

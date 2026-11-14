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
 * credential cannot hide a readable run list.
 *
 * JOV-10153: when the public retry also 403s (automation-liveness runs
 * 43404659161 / 43406130330 — the runner IP is throttled exactly while the
 * fleet has spent the shared token, 0/5000), the free GET /rate_limit
 * attributes the double 403 to the spent budget: the read is `deferred`
 * (the installation-budget sentinel's convention — gates that read on it
 * defer instead of deciding until it resets), not `unknown`, so a live
 * automation files no false P0 while its receipts are unreadable. The
 * attribution is strict: a funded budget, no api base, or an unreadable
 * /rate_limit keeps the original failure so silence stays red.
 */
const TIMEOUT_MS = 10_000;

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
    if (response.status !== 200)
      return { ok: false, reason: `http-${response.status}` };
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
 * True when the shared installation REST budget is provably spent
 * (resources.core.remaining <= 0). GET /rate_limit is exempt from the REST
 * quota and still answers once the budget is spent, so it can attribute a
 * double 403 to the budget instead of a silent automation.
 */
async function sharedBudgetSpent(fetchImpl, token, apiUrl) {
  if (!apiUrl) return false;
  const limit = await readJson(
    fetchImpl,
    `${apiUrl}/rate_limit`,
    githubHeaders(token)
  );
  const core = limit.ok ? limit.body?.resources?.core : null;
  return typeof core?.remaining === 'number' && core.remaining <= 0;
}

/**
 * Run-list read for the workflow observers; see the module header. The
 * unauthenticated retry runs only when a token was used and only on a 403;
 * a retry that also 403s defers only while the shared budget is spent.
 */
export async function readGithubJson(url, { fetchImpl, token, apiUrl = '' }) {
  const read = await readJson(fetchImpl, url, githubHeaders(token));
  if (read.ok || !token || read.reason !== 'http-403') return read;
  const recovery = await readJson(fetchImpl, url, {});
  if (
    !recovery.ok &&
    recovery.reason === 'http-403' &&
    (await sharedBudgetSpent(fetchImpl, token, apiUrl))
  )
    return { ok: false, deferred: true, reason: 'quota-deferred' };
  return recovery;
}

/**
 * Observation failure shape for the run-list observers: the `github-`
 * reason prefix with the deferred flag carried through (JOV-10153).
 */
export function githubReadFailure(read) {
  return {
    ok: false,
    deferred: read.deferred === true,
    reason: `github-${read.reason}`,
  };
}

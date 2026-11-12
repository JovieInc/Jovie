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
 * Run-list read for the workflow observers; see the module header. The
 * unauthenticated retry runs only when a token was used and only on a 403.
 */
export async function readGithubJson(url, { fetchImpl, token }) {
  const read = await readJson(fetchImpl, url, githubHeaders(token));
  if (read.ok || !token || read.reason !== 'http-403') return read;
  return readJson(fetchImpl, url, {});
}

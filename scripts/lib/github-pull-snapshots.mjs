/**
 * @typedef {{
 *   ok: boolean,
 *   status?: number,
 *   json: () => Promise<unknown>,
 *   headers?: { get?: (name: string) => string | null | undefined },
 * }} HttpResponse
 * @typedef {(
 *   input: string | URL | Request,
 *   init?: RequestInit,
 * ) => Promise<HttpResponse>} HttpFetch
 * @typedef {(path: string) => Promise<{ body: any, link: string }>} GithubGetBase
 * @typedef {(path: string) => Promise<{ body: any, link: string }>} GithubGet
/**
 * GitHub pull-request transport for the Linear validation lifecycle:
 * the GET client with bounded retry and quota classification, the closed-pull
 * snapshot (recent closed PRs answered without per-pull reads), and the
 * GraphQL batch that answers out-of-window pulls in ONE separately metered
 * call (JOV-12717: the shared REST-core bucket is the one that exhausts).
 */
/**
 * One retry for a transport failure (a thrown fetch, not an HTTP status), so a
 * dropped connection on a loaded runner does not fail the whole sweep.
 *
 * @param {HttpFetch} fetchImpl
 * @param {Parameters<HttpFetch>} args
 * @returns {Promise<HttpResponse>}
 */
export async function fetchWithRetry(fetchImpl, ...args) {
  try {
    return await fetchImpl(...args);
  } catch {
    return fetchImpl(...args);
  }
}

/** Do not sleep inside a 15-minute sweep for a reset that is further out. */
export const RATE_LIMIT_WAIT_CAP_MS = 8_000;

/**
 * @param {HttpResponse['headers']} headers
 * @param {number} [now]
 * @returns {number}
 */
export function headerRetryMs(headers, now = Date.now()) {
  const retry = headers?.get?.('retry-after');
  if (typeof retry === 'string' && /^\d+(\.\d+)?$/.test(retry.trim())) {
    return Math.ceil(Number(retry) * 1000);
  }
  let best = 0;
  for (const name of [
    'x-ratelimit-reset',
    'x-ratelimit-requests-reset',
    'x-ratelimit-complexity-reset',
  ]) {
    const value = Number(headers?.get?.(name));
    if (!Number.isFinite(value) || value <= 0) continue;
    const epochMs = value < 1e11 ? value * 1000 : value;
    const delta = epochMs - now;
    if (delta > best) best = delta;
  }
  return best;
}
/**
 * Wait only when the server named a delay inside the sweep budget. A reset
 * that is already past the cap means persist the cursor instead of sleeping.
 *
 * @param {number} retryAfterMs
 * @param {number} attempt
 * @param {number} maxAttempts
 * @returns {number | null}
 */
export function rateLimitWaitMs(retryAfterMs, attempt, maxAttempts) {
  if (attempt >= maxAttempts) return null;
  const hinted = Number(retryAfterMs);
  // A missing reset can use a short backoff. Infinity / a far reset cannot:
  // the caller persists the cursor instead of sleeping out the hour.
  if (!Number.isFinite(hinted)) return null;
  if (hinted > RATE_LIMIT_WAIT_CAP_MS) return null;
  if (hinted > 0) return hinted;
  return Math.min(2_000, 2 ** (attempt - 1) * 250);
}
/**
 * @param {number | undefined} status
 * @param {HttpResponse['headers']} headers
 * @param {any} body
 * @param {string} [path]
 */
export function githubStatusError(status, headers, body, path) {
  const remaining = headers?.get?.('x-ratelimit-remaining');
  const message = typeof body?.message === 'string' ? body.message : '';
  const rateLimited =
    status === 429 ||
    ((status === 403 || status === 429) &&
      (remaining === '0' || /rate limit/i.test(message)));
  const retryAfterMs = rateLimited ? headerRetryMs(headers) : 0;
  const forbidden = status === 403 && !rateLimited;
  const where = path ? ` for ${path}` : '';
  const detail = message ? `: ${message}` : '';
  return Object.assign(
    new Error(`GitHub HTTP ${status ?? 'error'}${where}${detail}`),
    {
      rateLimited,
      forbidden,
      retryAfterMs:
        rateLimited && retryAfterMs <= 0
          ? Number.POSITIVE_INFINITY
          : retryAfterMs,
    }
  );
}

/**
 * Attach the single-attempt GraphQL POST to a githubClient (JOV-12717).
 * @param {GithubGetBase & { graphql?: (query: string) => Promise<any> }} client
 * @param {Parameters<typeof fetchWithRetry>[0]} fetchImpl
 * @param {string} token
 */
function attachGraphQL(client, fetchImpl, token) {
  /**
   * ONE GraphQL POST (JOV-12717: batch the per-pull lifecycle fallback reads
   * off the exhausted shared REST-core bucket onto the separately-metered
   * GraphQL budget). Single attempt, no retry: any failure throws so callers
   * fall back to the existing per-pull REST path, whose quota classification
   * and immutable cache stay authoritative.
   * @param {string} query
   */
  client.graphql = async query => {
    const response = await fetchImpl('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'jovie-linear-sync-on-merge',
      },
      body: JSON.stringify({ query }),
    });
    const body = /** @type {{ errors?: unknown[], data?: unknown } | null} */ (
      await response.json().catch(() => null)
    );
    if (!response.ok) {
      throw Object.assign(
        new Error(
          `GitHub GraphQL ${response.status}: ${JSON.stringify(body?.errors ?? body ?? '').slice(0, 160)}`
        ),
        { rateLimited: response.status === 403 || response.status === 429 }
      );
    }
    if (body?.errors?.length) {
      throw new Error(
        `GitHub GraphQL partial failure: ${JSON.stringify(body.errors).slice(0, 160)}`
      );
    }
    return body?.data ?? null;
  };

  return client;
}

/** @param {number} ms */
function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * @param {HttpFetch} fetchImpl
 * @param {string} token
 * @returns {GithubGet}
 */
export function githubClient(fetchImpl, token, sleep = defaultSleep) {
  /** GET one API path (bounded retry; quota 403 classified rateLimited). */
  const client = async path => {
    // Bounded retry for transient GitHub upstream failures: a 503 from
    // api.github.com used to fail the whole lifecycle evaluation (JOV-5143,
    // run 37818346153) even though the next sweep would have converged.
    // A primary quota 403 (remaining 0) is not retried past the sweep budget:
    // the caller persists the cursor. A single inaccessible pull request is
    // `forbidden` so the sweep can skip it.
    const maxAttempts = 4;
    /** @type {Error | null} */
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetchWithRetry(
        fetchImpl,
        `https://api.github.com/${path}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'jovie-linear-sync-on-merge',
          },
        }
      );
      if (response.ok) {
        return {
          body: await response.json(),
          link: response.headers?.get?.('link') ?? '',
        };
      }
      const body = await response.json().catch(() => null);
      lastError = githubStatusError(
        response.status,
        response.headers,
        body,
        path
      );
      const flagged =
        /** @type {{ rateLimited?: boolean, forbidden?: boolean, retryAfterMs?: number }} */ (
          lastError
        );
      if (flagged.forbidden) throw lastError;
      const wait = flagged.rateLimited
        ? rateLimitWaitMs(flagged.retryAfterMs ?? 0, attempt, maxAttempts)
        : response.status === 429 ||
            (typeof response.status === 'number' && response.status >= 500)
          ? Math.min(4_000, 2 ** (attempt - 1) * 250)
          : null;
      if (wait == null || attempt === maxAttempts) throw lastError;
      await sleep(wait);
    }
    throw lastError ?? new Error(`GitHub request failed for ${path}`);
  };

  attachGraphQL(client, fetchImpl, token);
  return client;
}

/**
 * The GitHub client takes an API path, while a Link header carries an
 * absolute URL. Return the path so the next page request does not carry
 * the API origin twice (a 404 that would silently degrade the snapshot to
 * its fallback after one page).
 * @param {string} url
 * @returns {string}
 */
function apiPathFromLinkUrl(url) {
  return String(url).replace(/^https:\/\/api\.github\.com\//i, '');
}

/**
 * One bounded listing that answers whether the pull requests Linear attaches
 * to lifecycle issues are merged, without a per-issue `pulls/N` read. A full
 * sweep re-reads every attachment number otherwise; unmerged pulls are never
 * immutable, so they are re-read by every sweep until the shared
 * GITHUB_TOKEN quota dies partway (2026-10-30, run 41157880216: ~70 issues
 * in, 194 deferred, and a Merging issue starved behind the backlog).
 * `state=closed` returns merged and closed-unmerged rows together, so a
 * snapshot row that is not merged can never become a binding merge; open
 * numbers are answered by the complete open scan. Numbers outside the window
 * fall back to the per-pull read, so the snapshot never changes a binding
 * decision — it only removes reads that cannot change it.
 *
 * @param {{
 *   readonly fetchImpl: HttpFetch,
 *   readonly token: string,
 *   readonly repository: string,
 *   readonly maxPages?: number,
 * }} input
 * @returns {Promise<Map<number, ClosedPullSnapshotEntry>>}
 */
/**
 * @param {string} link
 * @returns {string}
 */
function nextPageLink(link) {
  for (const part of String(link ?? '').split(',')) {
    const match = /<([^>]+)>;\s*rel="next"/i.exec(part);
    if (match) return match[1];
  }
  return '';
}

/**
 * @typedef {{
 *   number: number,
 *   title: string,
 *   body: string,
 *   headRef: string,
 *   merged: boolean,
 *   mergedAt: string,
 *   mergeCommitSha: string,
 *   baseRef: string,
 * }} ClosedPullSnapshotEntry
 */
const MAX_CLOSED_PULL_SNAPSHOT_PAGES = 10;

export async function readClosedPullSnapshot(input) {
  const maxPages = input.maxPages ?? MAX_CLOSED_PULL_SNAPSHOT_PAGES;
  const github = githubClient(input.fetchImpl, input.token);
  /** @type {Map<number, ClosedPullSnapshotEntry>} */
  const snapshot = new Map();
  let path = `repos/${input.repository}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=1`;
  for (let page = 0; page < maxPages; page += 1) {
    const { body, link } = await github(path);
    if (!Array.isArray(body)) {
      throw new Error('GitHub closed pull request snapshot was not a list');
    }
    for (const row of body) {
      const number = Number(row?.number);
      if (!Number.isInteger(number) || number <= 0) continue;
      const mergedAt = typeof row?.merged_at === 'string' ? row.merged_at : '';
      const mergeCommitSha =
        typeof row?.merge_commit_sha === 'string' &&
        /^[0-9a-f]{40}$/i.test(row.merge_commit_sha)
          ? row.merge_commit_sha.toLowerCase()
          : '';
      snapshot.set(number, {
        number,
        title: typeof row?.title === 'string' ? row.title : '',
        body: typeof row?.body === 'string' ? row.body : '',
        headRef: typeof row?.head?.ref === 'string' ? row.head.ref : '',
        merged: Boolean(mergedAt) && Boolean(mergeCommitSha),
        mergedAt,
        mergeCommitSha,
        baseRef: typeof row?.base?.ref === 'string' ? row.base.ref : '',
      });
    }
    const next = nextPageLink(link);
    if (!next) break;
    path = apiPathFromLinkUrl(next);
  }
  return snapshot;
}

/**
 * Answer many pull-request states in ONE GraphQL POST (JOV-12717: the shared
 * REST-core bucket is the one that exhausts; GraphQL is separately metered).
 * Aliased pullRequest nodes, 50 per call. Any failure throws so the caller
 * falls back to the existing per-pull REST reads (whose immutable cache and
 * quota classification stay authoritative).
 * @param {GithubGetBase & { graphql?: (query: string) => Promise<any> }} github
 * @param {string} repository
 * @param {readonly number[]} numbers
 * @returns {Promise<Map<number, { state: string, mergedAt: string, mergeCommitSha: string, title: string, body: string, baseRef: string }>>}
 */
export async function fetchPullStatesBatched(github, repository, numbers) {
  if (typeof github.graphql !== 'function') {
    throw new Error('batched pull states need a graphql-capable client');
  }
  const [owner, name] = String(repository).split('/');
  if (!owner || !name || numbers.length === 0) {
    throw new Error('batched pull states need a repository and numbers');
  }
  const out = new Map();
  for (let offset = 0; offset < numbers.length; offset += 50) {
    const chunk = numbers.slice(offset, offset + 50);
    const aliases = chunk
      .map(
        (number, index) =>
          `p${index}: pullRequest(number: ${number}) { number state mergedAt mergeCommitSha title body base { ref } }`
      )
      .join(' ');
    const data = await github.graphql(
      `query { repository(owner: "${owner}", name: "${name}") { ${aliases} } }`
    );
    const repo = data?.repository;
    if (!repo) throw new Error('GitHub GraphQL batch returned no repository');
    for (const value of Object.values(repo)) {
      const number = Number(value?.number);
      if (!Number.isSafeInteger(number) || number <= 0) continue;
      out.set(number, {
        state: String(value?.state ?? ''),
        mergedAt: typeof value?.mergedAt === 'string' ? value.mergedAt : '',
        mergeCommitSha:
          typeof value?.mergeCommitSha === 'string' ? value.mergeCommitSha : '',
        title: typeof value?.title === 'string' ? value.title : '',
        body: typeof value?.body === 'string' ? value.body : '',
        baseRef: String(value?.base?.ref ?? ''),
      });
    }
  }
  return out;
}

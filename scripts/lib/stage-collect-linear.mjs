// api-budget: linear-requests 30/hr - daily report burst: 10 batches with at most 3 admissions each, report priority.
// api-budget: linear-complexity 15000/hr - daily report burst: 30 conservative admissions at 500 points, report priority.
import {
  createLinearClient,
  LINEAR_API_URL,
  LINEAR_BATCH_SIZE,
} from '../../packages/api-client/linear.ts';

const LINEAR_ISSUES = `query($numbers:[Float!]){issues(first:50,filter:{team:{key:{eq:"JOV"}},number:{in:$numbers}}){nodes{identifier createdAt startedAt history(first:30){pageInfo{hasNextPage} nodes{createdAt fromState{type} toState{type}}}}}}`;

// Linear budget-reserve: report priority sheds when the requests/complexity
// buckets dip below the reserve. Recovery is bounded — at most 3 admission
// calls per request (the original + 2 shed retries) and one shared 75s wait
// budget for the whole collection (inside the 60-90s window). Transport
// retries stay the client layer's job; maxWaitMs is NOT raised to wait on a
// shed (that would re-enable transport-level waiting).
const LINEAR_SHED_ATTEMPTS = 3;
const LINEAR_SHED_WAIT_BUDGET_MS = 75_000;
// 10 logical batches of 50 issues per run, 500 IDs total.
const LINEAR_MAX_BATCHES = 10;
const LINEAR_MAX_IDS = LINEAR_MAX_BATCHES * 50;

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** `JOV-<positive integer>` or null; tolerant of case, whitespace and separators. */
export function canonicalLinearIdentifier(raw) {
  const match = String(raw ?? '')
    .trim()
    .toUpperCase()
    .match(/^JOV[-_ ]?(\d+)$/);
  const number = match ? Number(match[1]) : NaN;
  return Number.isInteger(number) && number > 0 ? `JOV-${number}` : null;
}

/**
 * Deterministic fair slice of Linear identifiers: canonicalized, deduped
 * (the entry from the most recently merged PR wins), ordered most-recent
 * merge first, and capped at `maxIds` so a burst can never exceed the
 * 10-batch budget. Returns { identifiers, capped, dropped }.
 */
export function sliceLinearIdentifiers(
  entries,
  { maxIds = LINEAR_MAX_IDS } = {}
) {
  const ranked = [];
  const byId = new Map();
  for (const entry of entries ?? []) {
    const identifier = canonicalLinearIdentifier(
      typeof entry === 'string' ? entry : entry?.identifier
    );
    if (!identifier) continue;
    const parsedAt =
      typeof entry === 'string' ? null : Date.parse(entry?.mergedAt ?? '');
    const mergedAt = Number.isFinite(parsedAt) ? parsedAt : 0;
    const existing = byId.get(identifier);
    if (existing) {
      if (mergedAt > existing.mergedAt) existing.mergedAt = mergedAt;
      continue;
    }
    const record = { identifier, mergedAt };
    byId.set(identifier, record);
    ranked.push(record);
  }
  // Sort most-recent first; Array.prototype.sort is stable, so ties keep the
  // caller's original order and the slice stays deterministic.
  ranked.sort((a, b) => b.mergedAt - a.mergedAt);
  return {
    identifiers: ranked.slice(0, maxIds).map(r => r.identifier),
    capped: Math.max(0, ranked.length - maxIds),
  };
}

/**
 * One Linear request with a bounded shed retry. Only `kind === 'shed'`
 * (budget-reserve) is retried, via the error's `retryAt` epoch-ms reset:
 * a missing/past/non-finite reset, or one beyond the collection's remaining
 * wait budget, stops immediately — we never sleep-then-retry early. Each
 * admission gets at most 3 total calls (original + 2 shed retries); the
 * shared constraint across batches is the deadline, not the call counter.
 */
export async function linearAdmit(
  call,
  {
    deadline,
    maxCalls = LINEAR_SHED_ATTEMPTS,
    now = Date.now,
    sleep = defaultSleep,
  }
) {
  let lastError = null;
  for (let used = 0; used < maxCalls; used += 1) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
      if (error?.kind !== 'shed') throw error;
      const retryAt = Number(error?.retryAt);
      if (!Number.isFinite(retryAt) || retryAt <= now() || retryAt > deadline)
        throw error;
      await sleep(Math.max(0, retryAt - now()));
    }
  }
  throw lastError;
}

/**
 * Capped live pull of Linear issue history for the stage layer. One map
 * entry per returned issue plus collection counts; never throws — a failed
 * batch keeps the successful ones and is reported in `counts`.
 *
 * The query stays small (50 issues x 30 history entries per batch) and the
 * complexity cost is declared so the ledger reserves headroom; the real
 * spend is re-observed from the x-ratelimit-complexity-* response headers.
 * No Linear data is cached or persisted here: every daily run does a fresh
 * capped pull (the repo is public — issue identifiers and state-transition
 * timestamps must not land in git).
 */
export async function collectLinearIssues({
  fetchImpl = globalThis.fetch,
  apiKey,
  identifiers,
  now = Date.now,
  sleep = defaultSleep,
  /** Test seam: overrides linear.client.request; production is unset. */
  request = null,
}) {
  const linear = createLinearClient({
    identity: apiKey,
    authorization: () => apiKey,
    fetch: fetchImpl,
  });
  const costs = { requests: 1, complexity: 500 };
  const slice = sliceLinearIdentifiers(identifiers);
  const issues = {};
  const deadline = now() + LINEAR_SHED_WAIT_BUDGET_MS;
  let admittedBatches = 0;
  let fetched = 0;
  let missing = 0;
  let failed = 0;
  let historyTruncated = 0;
  let error = null;
  for (let i = 0; i < slice.identifiers.length; i += LINEAR_BATCH_SIZE) {
    const batch = slice.identifiers.slice(i, i + LINEAR_BATCH_SIZE);
    const numbers = batch.map(id => Number(id.split('-')[1]));
    let response;
    try {
      response = await linearAdmit(
        () =>
          request
            ? request({ numbers, costs })
            : linear.client.request({
                url: LINEAR_API_URL,
                method: 'POST',
                body: {
                  query: LINEAR_ISSUES,
                  variables: { numbers },
                },
                priority: 'report',
                timeoutMs: 20_000,
                costs,
              }),
        { deadline, now, sleep }
      );
      admittedBatches += 1;
    } catch (batchFailure) {
      failed += 1;
      error = String(batchFailure?.message ?? batchFailure).slice(0, 300);
      break; // Partial success: keep earlier batches, stop the collection.
    }
    if (response.status < 200 || response.status >= 300) {
      failed += 1;
      error = `Linear HTTP ${response.status}`;
      break;
    }
    let body;
    try {
      body = JSON.parse(response.text);
    } catch {
      failed += 1;
      error = 'Linear response was not JSON';
      break;
    }
    if (body.errors?.length) {
      failed += 1;
      error = body.errors
        .map(e => e.message)
        .join('; ')
        .slice(0, 300);
      break;
    }
    for (const node of body.data?.issues?.nodes ?? []) {
      if (!node?.identifier) continue;
      const truncatedHistory = Boolean(node.history?.pageInfo?.hasNextPage);
      if (truncatedHistory) historyTruncated += 1;
      const history = (node.history?.nodes ?? []).map(h => ({
        at: h.createdAt,
        fromType: h.fromState?.type ?? null,
        toType: h.toState?.type ?? null,
      }));
      const firstMove = history
        .filter(h => h.fromType)
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
      issues[node.identifier] = {
        identifier: node.identifier,
        createdAt: node.createdAt,
        startedAt: node.startedAt,
        // A truncated history hides the real first transition, so the
        // inferred 'unstarted' floor is not trustworthy — null it and flag.
        initialType:
          firstMove?.fromType ?? (truncatedHistory ? null : 'unstarted'),
        history,
        ...(truncatedHistory ? { historyTruncated: true } : {}),
      };
      fetched += 1;
    }
    missing +=
      numbers.length -
      (body.data?.issues?.nodes ?? []).filter(n => n?.identifier).length;
  }
  return {
    issues,
    counts: {
      requested: slice.identifiers.length,
      capped: slice.capped,
      fetched,
      missing,
      failed,
      historyTruncated,
      // Batches that completed an admission (incl. shed retries); failed
      // batches are counted in `failed`.
      admittedBatches,
    },
    ...(error ? { error } : {}),
  };
}

// Shared retry policy for source-head and merge-group Size Guard API reads.
export const SIZE_GUARD_API_BUDGET_MS = 100_000;

export const MAX_API_ATTEMPTS = 6;
const RETRY_MARGIN_MS = 2_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 15_000;
const JITTER_RATIO = 0.2;
const PRIMARY = 'primary-rate-limit';
const NONE = 'none';
function headerNumber(headers, name) {
  const value = headers?.get?.(name);
  return value != null && /^[0-9]+$/.test(String(value).trim())
    ? Number(value)
    : null;
}

function retryAfterMs(headers, now) {
  const raw = headers?.get?.('retry-after');
  if (raw == null) return null;
  const text = String(raw).trim();
  if (/^[0-9]+$/.test(text)) return now + Number(text) * 1000;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function classifyGitHubFailure({ status, message, headers, now }) {
  const remaining = headerNumber(headers, 'x-ratelimit-remaining');
  const reset = headerNumber(headers, 'x-ratelimit-reset');
  const retryAfter = retryAfterMs(headers, now);
  const bounds = [];
  if ((status === 403 || status === 429) && reset !== null)
    bounds.push(reset * 1000);
  if (retryAfter !== null) bounds.push(retryAfter);
  const retryAtMs = bounds.length ? Math.max(now, ...bounds) + 1000 : null;
  const text = String(message ?? '');
  if (
    /\bAPI rate limit (?:already )?exceeded\b/i.test(text) ||
    ((status === 403 || status === 429) && remaining === 0)
  ) {
    return { kind: PRIMARY, retryAtMs };
  }
  if (
    status === 429 ||
    /\bsecondary rate limit\b|\babuse (?:detection|rate limit)\b/i.test(text) ||
    (status === 403 && retryAfter !== null)
  ) {
    return { kind: 'secondary-rate-limit', retryAtMs };
  }
  if (
    status === 0 ||
    [500, 502, 503, 504].includes(Number(status)) ||
    /\bGitHub API request failed for\b/.test(text) ||
    /\b(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|socket hang up)\b/i.test(
      text
    )
  ) {
    return { kind: 'transient-server', retryAtMs };
  }
  return { kind: NONE, retryAtMs: null };
}

function backoffMs(attempt, random = () => 0.5) {
  const raw = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1));
  const roll = Number(random());
  const unit = Number.isFinite(roll) ? Math.min(1, Math.max(0, roll)) : 0.5;
  return Math.max(
    0,
    Math.round(raw * (1 - JITTER_RATIO + 2 * JITTER_RATIO * unit))
  );
}

/** Wait before the next attempt, or null when the answer is final or the wait misses the deadline. */
export function apiRetryDelay({
  status,
  message,
  headers,
  attempt,
  nowMs,
  deadlineMs,
  random = () => 0.5,
}) {
  if (attempt >= MAX_API_ATTEMPTS) return null;
  const failure = classifyGitHubFailure({
    status,
    message,
    headers,
    now: nowMs,
  });
  if (failure.kind === NONE) return null;
  const waitMs = Math.max(
    backoffMs(attempt, random),
    failure.retryAtMs === null ? 0 : failure.retryAtMs - nowMs
  );
  if (nowMs + waitMs > deadlineMs - RETRY_MARGIN_MS) return null;
  return waitMs;
}

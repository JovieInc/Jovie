/**
 * Help Center analytics contract and tracking wrapper (JOV-5905).
 * Payload is a strict allowlist — no raw queries, DOM text, paths, or
 * identity can leave the browser. Queries ship only as a truncated SHA-256
 * hash plus a coarse length bucket. Fire-and-forget: analytics failures can
 * never break search, article rendering, or support paths.
 */

export const HELP_ANALYTICS_SCHEMA_VERSION = 1;
export const HELP_ANALYTICS_ENDPOINT =
  'https://jov.ie/api/analytics/help-center';
export const HELP_ANALYTICS_EVENTS = Object.freeze([
  'help_center_viewed',
  'category_opened',
  'article_viewed',
  'search_opened',
  'search_query_submitted',
  'search_result_selected',
  'search_zero_results',
  'article_feedback',
  'related_guide_selected',
  'contact_support_opened',
  'support_request_submitted',
  'support_request_failed',
  'support_escalation',
]);

/** Top-level docs section slug -> canonical category id. */
export const HELP_SECTION_CATEGORIES = Object.freeze({
  'getting-started': 'jovie-essentials',
  features: 'build-your-presence',
  'self-serve-guide': 'build-your-presence',
  'plans-pricing': 'manage-jovie',
  'api-reference': 'developers',
});

export function categoryIdForPathname(pathname) {
  const section = String(pathname ?? '')
    .replace(/^\/+|\/+$/g, '')
    .split('/')[1];
  return HELP_SECTION_CATEGORIES[section] ?? null;
}

export const HELP_FEEDBACK_REASONS = Object.freeze([
  'outdated',
  'missing_info',
  'did_not_answer',
  'confusing',
]);

const HELP_QUERY_LENGTH_BUCKET_BOUNDS = Object.freeze([
  { bucket: 'le_8', max: 8 },
  { bucket: 'le_24', max: 24 },
  { bucket: 'le_64', max: 64 },
]);

const ARTICLE_ID_PATTERN = /^[a-z0-9][a-z0-9/_-]{0,119}$/;

export function normalizeQuery(query) {
  return String(query ?? '')
    .replace(/[\u0000-\u001f\s]+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 128);
}

export function queryLengthBucket(query) {
  const length = normalizeQuery(query).length;
  if (!length) return 'na';
  for (const { bucket, max } of HELP_QUERY_LENGTH_BUCKET_BOUNDS) {
    if (length <= max) return bucket;
  }
  return 'gt_64';
}

/** FNV-1a fallback when WebCrypto is unavailable (very old webviews). */
function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** SHA-256 of the normalized query, truncated to 16 hex chars. */
export async function hashQuery(query) {
  const normalized = normalizeQuery(query);
  if (!normalized) return '';
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      const digest = await subtle.digest(
        'SHA-256',
        new TextEncoder().encode(normalized)
      );
      return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
    }
  } catch {
    // fall through to the non-crypto hash
  }
  return fnv1a(normalized);
}

export function articleIdFromPathname(pathname) {
  const path = String(pathname ?? '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
  if (!path.startsWith('docs')) return null;
  const id = path.replace(/^docs\/?/, '') || 'index';
  return ARTICLE_ID_PATTERN.test(id) ? id : null;
}

export function viewportClass(width) {
  const value = Number(width);
  if (!Number.isFinite(value) || value <= 0) return 'sm';
  if (value < 768) return 'sm';
  if (value < 1024) return 'md';
  if (value < 1440) return 'lg';
  return 'xl';
}

export function referrerClass(hostname, referrerHostname) {
  if (!referrerHostname) return 'direct';
  if (!hostname) return 'unknown';
  return referrerHostname === hostname || referrerHostname.endsWith('.jov.ie')
    ? 'internal'
    : 'external';
}

function createEventId(event) {
  let opaque = '';
  try {
    opaque = globalThis.crypto?.randomUUID?.() ?? '';
  } catch {
    opaque = '';
  }
  if (!opaque) {
    // NOSONAR - telemetry dedupe only, never an auth/security token
    opaque = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }
  return `${opaque}:${event}`;
}

const PROPERTY_KEYS = Object.freeze([
  'article_id',
  'category_id',
  'query_hash',
  'query_length_bucket',
  'result_id',
  'result_rank',
  'source_article_id',
  'feedback',
  'feedback_reason',
  'source_surface',
  'referrer_class',
  'signed_in',
  'viewport_class',
  'build_id',
]);

function sanitizeProperties(properties) {
  const clean = {};
  for (const key of PROPERTY_KEYS) {
    const value = properties[key];
    if (value === undefined || value === null || value === '') continue;
    clean[key] = value;
  }
  for (const key of ['article_id', 'result_id', 'source_article_id']) {
    if (key in clean && !ARTICLE_ID_PATTERN.test(clean[key])) delete clean[key];
  }
  if (
    'result_rank' in clean &&
    (!Number.isInteger(clean.result_rank) || clean.result_rank < 0)
  ) {
    delete clean.result_rank;
  }
  return clean;
}

/** Returns null for off-contract event names so they can never be sent. */
export function buildHelpAnalyticsEvent(event, properties = {}) {
  if (!HELP_ANALYTICS_EVENTS.includes(event)) return null;
  return {
    schema_version: HELP_ANALYTICS_SCHEMA_VERSION,
    event_id: createEventId(event),
    event,
    client_ts: Date.now(),
    ...sanitizeProperties(properties),
  };
}

function baseContext() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {};
  }
  let refHost = '';
  try {
    refHost = document.referrer ? new URL(document.referrer).hostname : '';
  } catch {
    refHost = '';
  }
  return {
    referrer_class: referrerClass(window.location?.hostname ?? '', refHost),
    viewport_class: viewportClass(window.innerWidth),
    signed_in: 'unknown',
    build_id: window.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'unknown',
  };
}

function sendPayload(payload, { fetchImpl, beaconImpl } = {}) {
  const body = JSON.stringify(payload);
  const beacon =
    beaconImpl ??
    (typeof navigator !== 'undefined'
      ? navigator.sendBeacon?.bind(navigator)
      : undefined);
  if (beacon?.(HELP_ANALYTICS_ENDPOINT, body)) return Promise.resolve(true);
  const fetcher =
    fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!fetcher) return Promise.resolve(false);
  return fetcher(HELP_ANALYTICS_ENDPOINT, {
    method: 'POST',
    body,
    keepalive: true,
    credentials: 'omit',
    headers: { 'content-type': 'text/plain;charset=UTF-8' },
  })
    .then(() => true)
    .catch(() => false);
}

/**
 * Canonical Help Center tracking wrapper. Fire-and-forget: never throws,
 * never blocks rendering, and silently drops when transports are missing.
 */
export function trackHelpCenterEvent(event, properties = {}, options = {}) {
  try {
    const payload = buildHelpAnalyticsEvent(event, {
      ...baseContext(),
      ...properties,
    });
    if (!payload) return Promise.resolve(false);
    return sendPayload(payload, options);
  } catch {
    return Promise.resolve(false);
  }
}

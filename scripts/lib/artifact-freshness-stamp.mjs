/**
 * Stamp-PR awareness for artifact freshness (JOV-5368).
 *
 * Keep-owned cursor/stable-desktop-publish-* means publish is in the normal
 * path — suppress Summer page, still block resolve. DIRTY/exhausted do not.
 * Keep-owned stamps older than STAMP_IN_FLIGHT_MAX_AGE_MS escalate (page).
 */
import {
  findOpenDesktopStampPr,
  stampOwnershipDecision,
} from '../desktop-stamp-ownership.mjs';

const GITHUB_API = 'https://api.github.com';
const DEFAULT_REPO = 'JovieInc/Jovie';
const MAX_PULL_PAGES = 10;
/** Ship now: 6h grace. Re-evaluate when queue dwell norms change. */
export const STAMP_IN_FLIGHT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * @param {string | null | undefined} createdAt
 * @param {number} [nowMs]
 * @param {number} [maxAgeMs]
 */
export function stampDwellExceeded(
  createdAt,
  nowMs = Date.now(),
  maxAgeMs = STAMP_IN_FLIGHT_MAX_AGE_MS
) {
  if (typeof createdAt !== 'string' || createdAt.length === 0) return false;
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return false;
  return nowMs - createdMs > maxAgeMs;
}

/** @param {string | null | undefined} link */
export function nextLinkUrl(link) {
  for (const part of String(link ?? '').split(',')) {
    const match = /<([^>]+)>;\s*rel="next"/i.exec(part);
    if (match) return match[1];
  }
  return null;
}

/**
 * @param {{
 *   readonly repo?: string;
 *   readonly token?: string | null;
 *   readonly fetchImpl?: typeof fetch;
 *   readonly nowMs?: number;
 *   readonly maxAgeMs?: number;
 * }} [input]
 */
export async function fetchDesktopPublishInFlight(input = {}) {
  const repo = input.repo ?? DEFAULT_REPO;
  const fetchImpl = input.fetchImpl ?? fetch;
  const nowMs = input.nowMs ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? STAMP_IN_FLIGHT_MAX_AGE_MS;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'jovie-artifact-freshness',
  };
  const token = input.token ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    /** @type {unknown[]} */
    const pages = [];
    let listUrl = `${GITHUB_API}/repos/${repo}/pulls?state=open&base=main&per_page=100`;
    let truncated = false;
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const listResponse = await fetchImpl(listUrl, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!listResponse.ok) {
        return {
          inFlight: false,
          reason: `stamp list returned ${listResponse.status}`,
        };
      }
      const body = await listResponse.json();
      pages.push(Array.isArray(body) ? body : []);
      const link =
        typeof listResponse.headers?.get === 'function'
          ? listResponse.headers.get('link')
          : (listResponse.headers?.link ?? null);
      const next = nextLinkUrl(link);
      if (!next) {
        truncated = false;
        break;
      }
      if (page === MAX_PULL_PAGES - 1) {
        truncated = true;
        break;
      }
      listUrl = next;
    }
    if (truncated) {
      return { inFlight: false, reason: 'stamp list truncated' };
    }

    // findOpenDesktopStampPr expects page(s); GitHub list bodies are pages.
    const matches = findOpenDesktopStampPr(pages, repo);
    if (matches.length === 0) {
      return { inFlight: false, reason: 'no-open-stamp' };
    }
    if (matches.length > 1) {
      return { inFlight: false, reason: 'multiple-open-stamps' };
    }
    const listed = matches[0];
    // List payloads omit mergeable_state (JOV-13856). Without a successful
    // detail GET we must not treat the stamp as keep/in-flight — that would
    // suppress Summer for dirty/behind stamps.
    if (listed?.number == null) {
      return { inFlight: false, reason: 'stamp detail unavailable' };
    }
    const detailResponse = await fetchImpl(
      `${GITHUB_API}/repos/${repo}/pulls/${listed.number}`,
      { headers, signal: AbortSignal.timeout(30_000) }
    );
    if (!detailResponse.ok) {
      return {
        inFlight: false,
        reason: `stamp detail returned ${detailResponse.status}`,
        number: listed.number,
        url: listed.html_url ?? null,
      };
    }
    const detail = await detailResponse.json();
    const pr = {
      ...listed,
      mergeable_state: detail.mergeable_state ?? listed.mergeable_state,
      draft: detail.draft ?? listed.draft,
      html_url: detail.html_url ?? listed.html_url,
      head: detail.head ?? listed.head,
      labels: detail.labels ?? listed.labels,
      created_at: detail.created_at ?? listed.created_at,
    };
    const decision = stampOwnershipDecision(pr);
    if (
      decision.action === 'keep' &&
      stampDwellExceeded(pr.created_at, nowMs, maxAgeMs)
    ) {
      return {
        inFlight: false,
        reason: `stamp-dwell-exceeded:${decision.reason}`,
        number: decision.number ?? null,
        url: decision.url ?? null,
      };
    }
    return {
      inFlight: decision.action === 'keep',
      reason: decision.reason,
      number: decision.number ?? null,
      url: decision.url ?? null,
    };
  } catch (error) {
    return {
      inFlight: false,
      reason: `stamp lookup failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

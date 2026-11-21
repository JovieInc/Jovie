/**
 * Stamp-PR + desktop-release in-flight awareness for artifact freshness.
 * Keep-owned cursor/stable-desktop-publish-* suppresses Summer page.
 * After stamp merge, queued/in_progress desktop-release for the certified SHA
 * still counts as in-flight (closes the post-merge false-page window).
 * api-budget: github-actions-token 60/hr - open PR pages + stamp detail + up to
 * two desktop-release run pages (queued/in_progress) per reconcile
 */
import { GITHUB_API } from '../../packages/api-client/github.ts';
import {
  findOpenDesktopStampPr,
  stampOwnershipDecision,
} from '../desktop-stamp-ownership.mjs';

const DEFAULT_REPO = 'JovieInc/Jovie';
const MAX_PULL_PAGES = 10;
const DESKTOP_RELEASE_WORKFLOW = 'desktop-release.yml';
const RELEASE_IN_FLIGHT_STATUSES = Object.freeze(['queued', 'in_progress']);
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
 * True when a desktop-release run is queued/in_progress for headSha on main.
 * @param {{
 *   readonly repo?: string;
 *   readonly headSha?: string | null;
 *   readonly fetchImpl?: (input: any, init?: any) => Promise<any>;
 *   readonly headers?: Record<string, string>;
 * }} input
 */
export async function fetchDesktopReleaseInFlight(input) {
  const repo = input.repo ?? DEFAULT_REPO;
  const fetchImpl = input.fetchImpl ?? fetch;
  const headSha =
    typeof input.headSha === 'string' && /^[0-9a-f]{40}$/i.test(input.headSha)
      ? input.headSha.toLowerCase()
      : null;
  if (!headSha) {
    return { inFlight: false, reason: 'no-certified-sha' };
  }
  const headers = input.headers ?? {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'jovie-artifact-freshness',
  };
  try {
    for (const status of RELEASE_IN_FLIGHT_STATUSES) {
      const url = `${GITHUB_API}/repos/${repo}/actions/workflows/${DESKTOP_RELEASE_WORKFLOW}/runs?branch=main&status=${status}&head_sha=${headSha}&per_page=5`;
      const response = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        return {
          inFlight: null,
          reason: `desktop-release ${status} lookup returned ${response.status}`,
        };
      }
      const body = await response.json();
      const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
      if (
        runs.some(
          run =>
            typeof run?.head_sha === 'string' &&
            run.head_sha.toLowerCase() === headSha
        )
      ) {
        return { inFlight: true, reason: `desktop-release-${status}` };
      }
    }
    return { inFlight: false, reason: 'no-desktop-release-inflight' };
  } catch (error) {
    return {
      inFlight: null,
      reason: `desktop-release lookup failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * @param {{
 *   readonly repo?: string;
 *   readonly headSha?: string | null;
 *   readonly token?: string | null;
 *   readonly fetchImpl?: (input: any, init?: any) => Promise<any>;
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

  /** Prefer release-inflight over a false stamp result when observation is complete. */
  const withReleaseFallback = async stampResult => {
    const release = await fetchDesktopReleaseInFlight({
      repo,
      headSha: input.headSha,
      fetchImpl,
      headers,
    });
    if (release.inFlight === true || release.inFlight == null) return release;
    return stampResult;
  };

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
          inFlight: null,
          reason: `stamp list returned ${listResponse.status}`,
        };
      }
      const body = await listResponse.json();
      pages.push(Array.isArray(body) ? body : []);
      const link =
        typeof listResponse.headers?.get === 'function'
          ? listResponse.headers.get('link')
          : null;
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
      return { inFlight: null, reason: 'stamp list truncated' };
    }

    const matches = findOpenDesktopStampPr(pages, repo);
    if (matches.length === 0) {
      return withReleaseFallback({ inFlight: false, reason: 'no-open-stamp' });
    }
    if (matches.length > 1) {
      return withReleaseFallback({
        inFlight: false,
        reason: 'multiple-open-stamps',
      });
    }

    const listed = matches[0];
    if (listed?.number == null) {
      return { inFlight: null, reason: 'stamp detail unavailable' };
    }
    const detailResponse = await fetchImpl(
      `${GITHUB_API}/repos/${repo}/pulls/${listed.number}`,
      { headers, signal: AbortSignal.timeout(30_000) }
    );
    if (!detailResponse.ok) {
      return {
        inFlight: null,
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
    if (decision.action === 'keep') {
      if (stampDwellExceeded(pr.created_at, nowMs, maxAgeMs)) {
        return withReleaseFallback({
          inFlight: false,
          reason: `stamp-dwell-exceeded:${decision.reason}`,
          number: decision.number ?? null,
          url: decision.url ?? null,
        });
      }
      return {
        inFlight: true,
        reason: decision.reason,
        number: decision.number ?? null,
        url: decision.url ?? null,
      };
    }
    return withReleaseFallback({
      inFlight: false,
      reason: decision.reason,
      number: decision.number ?? null,
      url: decision.url ?? null,
    });
  } catch (error) {
    return {
      inFlight: null,
      reason: `stamp lookup failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

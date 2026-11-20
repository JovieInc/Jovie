/**
 * Stamp-PR awareness for artifact freshness (JOV-5368).
 *
 * Keep-owned cursor/stable-desktop-publish-* means publish is in the normal
 * path — suppress Summer page, still block resolve. DIRTY/exhausted do not.
 */
import {
  findOpenDesktopStampPr,
  stampOwnershipDecision,
} from '../desktop-stamp-ownership.mjs';

const GITHUB_API = 'https://api.github.com';
const DEFAULT_REPO = 'JovieInc/Jovie';

/**
 * @param {{
 *   readonly repo?: string;
 *   readonly token?: string | null;
 *   readonly fetchImpl?: typeof fetch;
 * }} [input]
 */
export async function fetchDesktopPublishInFlight(input = {}) {
  const repo = input.repo ?? DEFAULT_REPO;
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'jovie-artifact-freshness',
  };
  const token = input.token ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const listUrl = `${GITHUB_API}/repos/${repo}/pulls?state=open&base=main&per_page=100`;
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
    // findOpenDesktopStampPr expects page(s); a GitHub list body is one page.
    const matches = findOpenDesktopStampPr(
      Array.isArray(body) ? [body] : body,
      repo
    );
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
    };
    const decision = stampOwnershipDecision(pr);
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

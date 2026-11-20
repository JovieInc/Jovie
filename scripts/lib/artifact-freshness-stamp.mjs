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
    const matches = findOpenDesktopStampPr(body, repo);
    if (matches.length === 0) {
      return { inFlight: false, reason: 'no-open-stamp' };
    }
    if (matches.length > 1) {
      return { inFlight: false, reason: 'multiple-open-stamps' };
    }
    let pr = matches[0];
    if (pr?.number != null) {
      const detailResponse = await fetchImpl(
        `${GITHUB_API}/repos/${repo}/pulls/${pr.number}`,
        { headers, signal: AbortSignal.timeout(30_000) }
      );
      if (detailResponse.ok) {
        const detail = await detailResponse.json();
        pr = {
          ...pr,
          mergeable_state: detail.mergeable_state ?? pr.mergeable_state,
          draft: detail.draft ?? pr.draft,
          html_url: detail.html_url ?? pr.html_url,
          head: detail.head ?? pr.head,
          labels: detail.labels ?? pr.labels,
        };
      }
    }
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

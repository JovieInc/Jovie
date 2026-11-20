/**
 * Classify shipped-desktop publication failures: incomplete observation vs
 * verification mismatch. Shared by desktop audit + artifact freshness.
 */
import { isInstallationQuota403 } from './github-installation-quota.mjs';
import { classifyGitHubFailure } from './github-rate-limit.mjs';

/**
 * Transient fetch/API failures are incomplete observation — not a bad publish.
 * Digest/content mismatches stay verification failures.
 * Bare permission 403s stay verification/publication errors; only rate-limit /
 * secondary-rate-limit style 403s (same family as github-rate-limit.mjs) count
 * as observation failures.
 * @param {unknown} error
 */
export function isPublicationObservationError(error) {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  if (
    name === 'AbortError' ||
    /timeout|network|ECONNRESET|ENOTFOUND|fetch failed/i.test(message)
  ) {
    return true;
  }
  const statusMatch =
    /\bGitHub (\d{3})\b/.exec(message) ??
    /Published feed returned (\d{3})\./.exec(message);
  if (!statusMatch) return false;
  const status = Number(statusMatch[1]);
  if (status === 429 || status >= 500) return true;
  if (status !== 403) return false;
  if (isInstallationQuota403(message, 403)) return true;
  return classifyGitHubFailure({ status: 403, message }).kind !== 'none';
}

/**
 * @param {number} status
 * @param {string} [body]
 */
export function githubHttpErrorMessage(url, status, body = '') {
  const detail = body.trim().slice(0, 240);
  return `GitHub ${status} for ${url}${detail ? `: ${detail}` : ''}`;
}

/**
 * @param {number} status
 * @param {string} [body]
 */
export function publishedFeedErrorMessage(status, body = '') {
  const detail = body.trim().slice(0, 240);
  return `Published feed returned ${status}.${detail ? ` ${detail}` : ''}`;
}

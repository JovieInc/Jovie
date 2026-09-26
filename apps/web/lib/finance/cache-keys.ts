import { assertFinancialOwnerId } from './owner';

/**
 * Finance cache keys (JOV-4609).
 *
 * Financial data may only ever be cached under a key derived from the
 * financial owner's `users.id`. Creator-scoped, workspace-scoped, or
 * unscoped cache entries containing financial data are prohibited.
 */

const FINANCE_CACHE_PREFIX = 'fin';

/** Build an owner-scoped cache key: `fin:<ownerUserId>:<scope>`. */
export function financeCacheKey(ownerUserId: string, scope: string): string {
  const owner = assertFinancialOwnerId(ownerUserId);
  if (!scope || scope.includes(':')) {
    throw new TypeError('Finance cache scope must be a non-empty segment');
  }
  return `${FINANCE_CACHE_PREFIX}:${owner}:${scope}`;
}

/**
 * True when a cache key is a finance key for a different owner — i.e. a key
 * that must never be served to the given owner (collision/SSR-leak guard).
 */
export function isForeignFinanceCacheKey(
  key: string,
  ownerUserId: string
): boolean {
  const owner = assertFinancialOwnerId(ownerUserId);
  return (
    key.startsWith(`${FINANCE_CACHE_PREFIX}:`) &&
    !key.startsWith(`${FINANCE_CACHE_PREFIX}:${owner}:`)
  );
}

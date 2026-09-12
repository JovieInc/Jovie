import { sql as drizzleSql } from 'drizzle-orm';
import { z } from 'zod';

export const profileSearchQueryScopeSchema = z
  .object({
    creatorProfileId: z.string().uuid(),
    queryId: z.string().uuid(),
    queryText: z.string().trim().min(1).max(120),
    market: z.string().regex(/^[A-Z]{2}$/),
  })
  .strict();

export type ProfileSearchQueryScope = z.infer<
  typeof profileSearchQueryScopeSchema
>;

/** Scope is matched inside the locked claim, never after leasing another artist. */
export function buildClaimDueQuerySql(input?: ProfileSearchQueryScope) {
  const scope =
    input === undefined
      ? undefined
      : profileSearchQueryScopeSchema.parse(input);
  const scopePredicate = scope
    ? drizzleSql`AND creator_profile_id = ${scope.creatorProfileId}::uuid
        AND id = ${scope.queryId}::uuid
        AND query_text = ${scope.queryText}
        AND market = ${scope.market}
        AND locale = 'en'
        AND device = 'desktop'`
    : drizzleSql``;

  return drizzleSql`
    WITH candidate AS (
      SELECT id
      FROM profile_search_queries
      WHERE enabled = true
        AND provider = ${'google_serpapi'}
        AND next_run_at <= now()
        AND (lease_expires_at IS NULL OR lease_expires_at < now())
        ${scopePredicate}
      ORDER BY next_run_at ASC, creator_profile_id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE profile_search_queries AS query
    SET lease_token = gen_random_uuid(),
        lease_expires_at = now() + (${120} * interval '1 second'),
        updated_at = now()
    FROM candidate
    WHERE query.id = candidate.id
    RETURNING query.id, query.query_text, query.market, query.locale, query.device
  `;
}

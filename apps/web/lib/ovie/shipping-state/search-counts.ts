import {
  githubGraphql,
  isAuthorityRead,
  issueCount,
  type LiveIo,
} from './live';

const SEARCH_COUNT_ALIAS_RE = /^[a-z][a-z0-9_]{0,40}$/;
export const SEARCH_COUNTS_MAX_ALIASES = 60;
/**
 * GitHub evaluates every aliased search server-side before it answers, so a
 * 60-alias backfill takes longer than the 2.5s single-read budget. Hourly
 * sync only, never on a read path.
 */
export const SEARCH_COUNTS_TIMEOUT_MS = 8_000;

export type SearchCountsRead =
  | {
      readonly status: 'ok';
      readonly counts: Readonly<Record<string, number>>;
    }
  | { readonly status: 'unavailable'; readonly reason: string };

/**
 * Exact GitHub search `issueCount` for each aliased query, in one GraphQL
 * request through the same token, timeout and rate-limit backoff as the
 * shipping readers. Company history uses it to fill daily counts; it is never
 * on a read path.
 */
export async function readSearchCounts(
  io: LiveIo,
  queries: Readonly<Record<string, string>>
): Promise<SearchCountsRead> {
  const aliases = Object.keys(queries);
  if (
    aliases.length === 0 ||
    aliases.length > SEARCH_COUNTS_MAX_ALIASES ||
    aliases.some(alias => !SEARCH_COUNT_ALIAS_RE.test(alias))
  ) {
    return { status: 'unavailable', reason: 'invalid-search-aliases' };
  }
  const variables = aliases.map(alias => `$${alias}:String!`).join(',');
  const fields = aliases
    .map(
      alias => `${alias}:search(type:ISSUE,query:$${alias},first:1){issueCount}`
    )
    .join('');
  try {
    const data = await githubGraphql(
      io,
      'github-merges',
      `query CompanyHistoryCounts(${variables}){${fields}}`,
      queries,
      SEARCH_COUNTS_TIMEOUT_MS
    );
    if (isAuthorityRead(data)) {
      return { status: 'unavailable', reason: 'github-unavailable' };
    }
    const counts: Record<string, number> = {};
    for (const alias of aliases) {
      const count = issueCount(data, alias);
      if (count === null)
        return { status: 'unavailable', reason: 'malformed-search-count' };
      counts[alias] = count;
    }
    return { status: 'ok', counts };
  } catch {
    return { status: 'unavailable', reason: 'github-unavailable' };
  }
}

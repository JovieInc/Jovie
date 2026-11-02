/**
 * Pure name helpers for catalog matching. No server-only import so they can be
 * unit tested and shared by sources and the resolver without a cycle.
 */

export function normalizeCatalogName(value: string): string {
  const normalized = value.normalize('NFKC').toLowerCase();
  if (!/[\p{L}\p{N}]/u.test(normalized)) return '';
  return normalized
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim();
}

export function sameCatalogName(left: string, right: string): boolean {
  const normalized = normalizeCatalogName(left);
  return normalized.length > 0 && normalized === normalizeCatalogName(right);
}

/**
 * Collaborator separators: "A & B", "A and B", "A x B", "A with B",
 * "A feat. B", "A ft. B", "A featuring B", "A vs B", "A + B", "A, B", "A / B".
 * Word separators need surrounding whitespace so names like "Rex" survive.
 */
const CREDIT_SEPARATOR =
  /\s+(?:&|and|x|×|with|vs\.?|versus|feat\.?|ft\.?|featuring|\+)\s+|\s*[,;/]\s*/iu;

/** "Song (feat. X)" style credit parentheses on an artist string. */
const CREDIT_PARENS =
  /[([]\s*(?:feat\.?|ft\.?|featuring|with)\s+([^)\]]*)[)\]]/giu;

function creditNames(value: string): string[] {
  const unwrapped = value.replace(CREDIT_PARENS, ' feat. $1');
  return unwrapped
    .split(CREDIT_SEPARATOR)
    .map(normalizeCatalogName)
    .filter(name => name.length > 0);
}

/** Normalized individual credits in an artist string or multi-artist array. */
export function creditSet(
  artists: string | readonly string[]
): ReadonlySet<string> {
  const values = typeof artists === 'string' ? [artists] : artists;
  return new Set(values.flatMap(creditNames));
}

export type CreditMatch = 'exact' | 'credit' | null;

/**
 * How a query artist relates to a catalog item's credits.
 * - exact: the whole credit string matches, or both sides credit the same set
 *   of artists ("Coldplay & BTS" vs ["BTS", "Coldplay"]).
 * - credit: every queried artist is credited, with additional collaborators.
 * - null: no match. A credit-only match is weaker evidence than exact, so
 *   callers must corroborate it with an identifier before resolving.
 */
export function matchArtistCredits(
  query: string,
  hitArtist: string,
  hitArtists?: readonly string[]
): CreditMatch {
  if (sameCatalogName(query, hitArtist)) return 'exact';
  if (hitArtists?.some(name => sameCatalogName(query, name))) {
    return hitArtists.length === 1 ? 'exact' : 'credit';
  }
  const wanted = creditSet(query);
  if (wanted.size === 0) return null;
  const have = creditSet(
    hitArtists && hitArtists.length > 0 ? hitArtists : hitArtist
  );
  const wantedAll = [...wanted];
  if (!wantedAll.every(name => have.has(name))) return null;
  return have.size === wanted.size ? 'exact' : 'credit';
}

/** UPCs differ by leading zeros between providers (12, 13 and 14 digits). */
export function sameUpc(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  const a = left.replace(/^0+/, '');
  return a.length > 0 && a === right.replace(/^0+/, '');
}

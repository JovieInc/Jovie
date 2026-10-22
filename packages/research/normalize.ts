import { createHash } from 'node:crypto';

import type { Freshness, Mode } from './types.ts';

const STOPWORDS = new Set(
  'a an and are as at be by can could did do does for from get got has have how i if in into is it its me my of on or our please should so than that the their them then there these they this to us use used using was we were what when where which who why will with work works would you your'.split(
    ' '
  )
);

/**
 * Order-insensitive token set so "exa pricing per request" and
 * "What is the per-request pricing for Exa?" share one cache entry.
 * Year-like and version tokens are kept: they change the answer.
 */
export function normalizeQuery(query: string): string {
  const tokens = query
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.+#/-]+/g, ' ')
    .split(' ')
    .map(t => t.replace(/^[.\-/]+|[.\-/]+$/g, ''))
    .filter(t => t.length > 0 && !STOPWORDS.has(t));
  return [...new Set(tokens)].sort().join(' ');
}

function stem(token: string): string {
  if (token.length <= 4 || /\d/.test(token)) return token;
  return token.replace(/(ing|ed|es|s)$/, '');
}

/** Stemmed token set for near-duplicate matching ("pricing" ~ "price", "per-request" ~ "per request"). */
export function tokenSet(query: string): Set<string> {
  return new Set(
    normalizeQuery(query)
      .split(/[\s/-]+/)
      .filter(Boolean)
      .map(stem)
  );
}

/**
 * Jaccard similarity of stemmed token sets, but 0 when numeric tokens differ:
 * "gpt-5.5 pricing" and "gpt-5.6 pricing" must never share a cache entry.
 */
export function similarity(a: string, b: string): number {
  const x = tokenSet(a);
  const y = tokenSet(b);
  const numeric = (s: Set<string>) =>
    [...s]
      .filter(t => /\d/.test(t))
      .sort()
      .join(' ');
  if (numeric(x) !== numeric(y)) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared += 1;
  const union = x.size + y.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Stopword-stripped terms in original order: what keyword indexes (gbrain search, rg) match best. */
export function keywords(query: string, max = 8): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of query.toLowerCase().split(/[^a-z0-9.+#_-]+/)) {
    const t = raw.replace(/^[.\-_]+|[.\-_]+$/g, '');
    if (!t || STOPWORDS.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out.join(' ');
}

export function queryKey(
  query: string,
  freshness: Freshness,
  mode: Mode,
  social = false
): string {
  const parts = [
    normalizeQuery(query),
    freshness,
    mode,
    social ? 'social' : '',
  ];
  return createHash('sha256')
    .update(parts.join('\0'))
    .digest('hex')
    .slice(0, 20);
}

/** Cheap heuristic when the caller did not say how fresh the answer must be. */
export function inferFreshness(query: string): Freshness {
  const q = query.toLowerCase();
  if (/\b(right now|live|status|outage|today|tonight)\b/.test(q)) return 'live';
  if (
    /\b(this week|latest|new(est)?|just (shipped|released|launched)|changelog|release notes)\b/.test(
      q
    )
  )
    return 'week';
  if (
    /\b(20\d\d|this month|recent(ly)?|pricing|price|cost|rate limit|quota|version)\b/.test(
      q
    )
  )
    return 'month';
  return 'evergreen';
}

export function extractUrls(query: string): string[] {
  return [...query.matchAll(/https?:\/\/[^\s<>"')]+/g)].map(m => m[0]);
}

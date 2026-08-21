import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const GBRAIN_TIMEOUT_MS = 30_000;
/** Keyword index cap aligned with JOV-4185's 10s ownership ceiling. */
export const KEYWORD_TIMEOUT_MS = 10_000;
/** Semantic/hybrid query is a bounded fallback, never a 30s hang. */
export const SEMANTIC_TIMEOUT_MS = 10_000;

function gbrainBin() {
  return process.env.JOVIE_GBRAIN_BIN || 'gbrain';
}

function run(args, timeoutMs = GBRAIN_TIMEOUT_MS) {
  return execFileSync(gbrainBin(), args, {
    encoding: 'utf8',
    timeout: timeoutMs,
  }).trim();
}

export function keywordSearchArgs(query, limit = 3) {
  return ['search', query, '--limit', String(limit)];
}

export function semanticSearchArgs(query, limit = 3) {
  return ['query', query, '--limit', String(limit)];
}

export async function getPage(slug) {
  return parsePage(slug, run(['get', slug]));
}

export function parsePage(slug, raw) {
  const document = String(raw || '');
  const start = document.indexOf('---\n');
  const end = start < 0 ? -1 : document.indexOf('\n---\n', start + 4);
  if (start < 0 || end < 0) return null;
  const frontmatter = document.slice(start + 4, end);
  const revision = /^updated_at:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(
    frontmatter
  )?.[1];
  return {
    slug,
    id: slug,
    revision: revision || createHash('sha256').update(document).digest('hex'),
    compiledTruth: document.slice(end + 5),
  };
}

async function pagesForSlugs(raw, limit) {
  const slugs = parseSearchSlugs(raw).slice(0, limit);
  return Promise.all(slugs.map(getPage));
}

export async function searchPagesKeyword(query, limit = 3) {
  return pagesForSlugs(
    run(keywordSearchArgs(query, limit), KEYWORD_TIMEOUT_MS),
    limit
  );
}

export async function searchPagesSemantic(query, limit = 3) {
  return pagesForSlugs(
    run(semanticSearchArgs(query, limit), SEMANTIC_TIMEOUT_MS),
    limit
  );
}

function bindablePages(pages) {
  return Array.isArray(pages) ? pages.filter(Boolean) : [];
}

/**
 * Keyword-first targeted lookup (JOV-4185 / JOV-5268).
 * Semantic/hybrid `query` runs only when keyword cannot bind a page.
 * A failed semantic command never erases a successful keyword result.
 */
export async function searchPages(query, limit = 3) {
  let keywordPages = [];
  let keywordError = null;
  try {
    keywordPages = await searchPagesKeyword(query, limit);
    const bound = bindablePages(keywordPages);
    if (bound.length > 0) return bound;
  } catch (error) {
    keywordError = error;
  }

  try {
    const semanticPages = await searchPagesSemantic(query, limit);
    const bound = bindablePages(semanticPages);
    if (bound.length > 0) return bound;
    if (keywordError) throw keywordError;
    return Array.isArray(semanticPages) ? semanticPages : [];
  } catch (semanticError) {
    const bound = bindablePages(keywordPages);
    if (bound.length > 0) return bound;
    if (keywordError) throw keywordError;
    throw semanticError;
  }
}

export function parseSearchSlugs(raw) {
  return [...String(raw || '').matchAll(/^\[[^\]]+\]\s+([^\s]+)\s+--/gm)]
    .map(match => match[1])
    .filter((slug, index, all) => all.indexOf(slug) === index);
}

export const cliGbrainClient = Object.freeze({
  getPage,
  searchPages,
  searchPagesKeyword,
  searchPagesSemantic,
});

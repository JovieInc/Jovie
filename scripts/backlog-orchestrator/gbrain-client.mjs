import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const GBRAIN_BIN = process.env.JOVIE_GBRAIN_BIN || 'gbrain';
export const GBRAIN_GET_TIMEOUT_MS = 30_000;
export const GBRAIN_KEYWORD_TIMEOUT_MS = 10_000;
export const GBRAIN_SEMANTIC_TIMEOUT_MS = 10_000;
export const MAX_KEYWORD_ATTEMPTS = 5;

const CONTEXT_QUERY_PREFIXES = [
  /^ownership and current priorities for\s+/i,
  /^existing agent work and prior decisions related to\s+/i,
];

/**
 * @typedef {{ ok: true, timedOut: false, stdout: string, stderr: string }} GbrainRunOk
 * @typedef {{ ok: false, timedOut: boolean, stdout: string, stderr: string }} GbrainRunErr
 * @typedef {GbrainRunOk | GbrainRunErr} GbrainRunResult
 * @typedef {(args: string[], timeoutMs?: number) => GbrainRunResult} GbrainRunner
 */

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function keyTerms(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .slice(0, 8)
    .join(' ');
}

export function issueTermsFromQuery(query) {
  let text = String(query || '').trim();
  for (const prefix of CONTEXT_QUERY_PREFIXES) {
    text = text.replace(prefix, '');
  }
  return keyTerms(text) || text;
}

export function keywordAttemptsFor(query, identifier) {
  const seen = new Set();
  const attempts = [];
  const add = value => {
    const term = String(value || '').trim();
    if (!term) return;
    const key = term.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push(term);
  };

  const terms = issueTermsFromQuery(query);
  add(terms);
  const words = terms.split(/\s+/).filter(Boolean);
  const reserved = nonEmptyString(identifier) ? 1 : 0;
  for (
    let i = 0;
    i < words.length - 1 && attempts.length < MAX_KEYWORD_ATTEMPTS - reserved;
    i += 1
  ) {
    add(`${words[i]} ${words[i + 1]}`);
  }
  add(identifier);
  return attempts.slice(0, MAX_KEYWORD_ATTEMPTS);
}

/**
 * @param {string[]} args
 * @param {number} [timeoutMs]
 * @returns {GbrainRunResult}
 */
export function runGbrain(args, timeoutMs = GBRAIN_GET_TIMEOUT_MS) {
  const result = spawnSync(GBRAIN_BIN, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  const error = result.error;
  const timedOut = Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ETIMEDOUT'
  );
  if (timedOut || result.status !== 0 || result.error) {
    return { ok: false, timedOut, stdout, stderr };
  }
  return { ok: true, timedOut: false, stdout, stderr };
}

function runOrThrow(args, timeoutMs) {
  const result = runGbrain(args, timeoutMs);
  if (!result.ok) {
    throw new Error(result.stderr || `gbrain ${args[0] || 'command'} failed`);
  }
  return result.stdout;
}

export async function getPage(slug) {
  return parsePage(slug, runOrThrow(['get', slug], GBRAIN_GET_TIMEOUT_MS));
}

function parseJsonPage(slug, raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const compiledTruth =
      parsed.compiled_truth || parsed.compiledTruth || parsed.body || '';
    const revision =
      parsed.frontmatter?.updated_at ||
      parsed.content_hash ||
      parsed.revision ||
      parsed.updated_at ||
      parsed.updatedAt;
    const document = typeof compiledTruth === 'string' ? compiledTruth : raw;
    return {
      slug: nonEmptyString(parsed.slug) ? parsed.slug : slug,
      id: parsed.id ?? parsed.page_id ?? slug,
      revision: nonEmptyString(String(revision || ''))
        ? String(revision)
        : createHash('sha256').update(document).digest('hex'),
      compiledTruth: document,
    };
  } catch {
    return null;
  }
}

export function parsePage(slug, raw) {
  const document = String(raw || '').trim();
  if (!document) return null;
  if (document.startsWith('{')) {
    return parseJsonPage(slug, document);
  }
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

function parseJsonSearchSlugs(raw) {
  try {
    const parsed = JSON.parse(raw);
    const hits = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.results)
        ? parsed.results
        : Array.isArray(parsed?.hits)
          ? parsed.hits
          : [];
    return hits
      .map(hit => (typeof hit === 'string' ? hit : hit?.slug))
      .filter(slug => nonEmptyString(slug));
  } catch {
    return null;
  }
}

export function parseSearchSlugs(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  if (text.startsWith('[') || text.startsWith('{')) {
    const jsonSlugs = parseJsonSearchSlugs(text);
    if (jsonSlugs) {
      return jsonSlugs.filter(
        (slug, index, all) => all.indexOf(slug) === index
      );
    }
  }
  return [...text.matchAll(/^\[[^\]]+\]\s+([^\s]+)\s+--/gm)]
    .map(match => match[1])
    .filter((slug, index, all) => all.indexOf(slug) === index);
}

/**
 * @param {string[]} slugs
 * @param {(slug: string) => Promise<unknown>} loadPage
 */
async function loadBindablePages(slugs, loadPage) {
  const pages = [];
  let loadError = false;
  for (const slug of slugs) {
    try {
      const page = await loadPage(slug);
      if (page) pages.push(page);
    } catch {
      loadError = true;
    }
  }
  return { pages, loadError };
}

/**
 * Keyword-first targeted lookup (JOV-4185 / JOV-5268).
 * Semantic/hybrid `query` runs only when no keyword attempt binds a page.
 * A failed semantic command cannot erase a successful keyword result.
 *
 * @param {string} query
 * @param {number} [limit]
 * @param {{ identifier?: string, run?: GbrainRunner, getPage?: (slug: string) => Promise<unknown> }} [options]
 */
export async function searchPages(query, limit = 3, options = {}) {
  const runner = options.run || runGbrain;
  const loadPage = options.getPage || getPage;
  const attempts = keywordAttemptsFor(query, options.identifier);
  let keywordHealthyEmpty = false;

  for (const attempt of attempts) {
    const result = runner(
      ['search', attempt, '--limit', String(limit)],
      GBRAIN_KEYWORD_TIMEOUT_MS
    );
    if (!result.ok) continue;
    const slugs = parseSearchSlugs(result.stdout).slice(0, limit);
    if (slugs.length === 0) {
      keywordHealthyEmpty = true;
      continue;
    }
    const loaded = await loadBindablePages(slugs, loadPage);
    if (loaded.pages.length > 0) return loaded.pages;
    if (!loaded.loadError) keywordHealthyEmpty = true;
  }

  const semantic = runner(
    ['query', query, '--limit', String(limit)],
    GBRAIN_SEMANTIC_TIMEOUT_MS
  );
  if (semantic.ok) {
    const slugs = parseSearchSlugs(semantic.stdout).slice(0, limit);
    const loaded = await loadBindablePages(slugs, loadPage);
    if (loaded.pages.length > 0) return loaded.pages;
    return [];
  }

  if (keywordHealthyEmpty) return [];
  throw new Error(semantic.stderr || 'gbrain-unavailable');
}

export const cliGbrainClient = Object.freeze({ getPage, searchPages });

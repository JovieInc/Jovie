import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const GBRAIN_TIMEOUT_MS = 30_000;
const CONTEXT_LOOKUP_TIMEOUT_MS = 10_000;
const KEYWORD_LOOKUP_TIMEOUT_MS = 5_000;

export function resolveGbrainBin(env = process.env) {
  return env.JOVIE_GBRAIN_BIN?.trim() || 'gbrain';
}

export function resolveGbrainDialect(env = process.env) {
  return env.JOVIE_GBRAIN_DIALECT === 'adapter' ? 'adapter' : 'legacy';
}

function positiveTimeout(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.floor(parsed))
    : fallback;
}

function jsonValue(raw) {
  const value = String(raw || '').trim();
  if (!value.startsWith('{') && !value.startsWith('[')) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parsePage(slug, raw) {
  const parsed = jsonValue(raw);
  if (parsed && !Array.isArray(parsed)) {
    const page = parsed.page || parsed.data?.page || parsed.data || parsed;
    const compiledTruth =
      page.compiledTruth ||
      page.compiled_truth ||
      page.body ||
      page.content ||
      page.text;
    if (!page || typeof page !== 'object' || typeof compiledTruth !== 'string')
      return null;
    const resolvedSlug = String(page.slug || slug).trim();
    if (!resolvedSlug) return null;
    const revision =
      page.contentHash ||
      page.content_hash ||
      page.revision ||
      page.version ||
      page.frontmatter?.updated_at ||
      page.updatedAt ||
      page.updated_at ||
      createHash('sha256').update(compiledTruth).digest('hex');
    return {
      slug: resolvedSlug,
      id: String(page.id ?? page.page_id ?? resolvedSlug),
      revision: String(revision),
      compiledTruth,
    };
  }

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

export function parseSearchSlugs(raw) {
  const parsed = jsonValue(raw);
  if (parsed) {
    const results = Array.isArray(parsed)
      ? parsed
      : parsed.results || parsed.data?.results || parsed.data || [];
    if (!Array.isArray(results)) return [];
    return results
      .map(result => result?.slug || result?.page?.slug || result?.page_slug)
      .filter(
        (slug, index, all) =>
          typeof slug === 'string' &&
          slug.trim().length > 0 &&
          all.indexOf(slug) === index
      );
  }
  return [...String(raw || '').matchAll(/^\[[^\]]+\]\s+([^\s]+)\s+--/gm)]
    .map(match => match[1])
    .filter((slug, index, all) => all.indexOf(slug) === index);
}

function lookupFailure(errors) {
  return new AggregateError(errors, 'gbrain-context-lookup-failed');
}

/**
 * @param {{
 *   bin?: string,
 *   dialect?: 'adapter' | 'legacy',
 *   execute?: (command: string, args: string[], options: {encoding: string, timeout: number}) => unknown | Promise<unknown>,
 *   now?: () => number,
 * }} [options]
 */
export function createGbrainClient({
  bin = resolveGbrainBin(),
  dialect = resolveGbrainDialect(),
  execute = async (command, args, options) => {
    const result = await execFileAsync(command, args, options);
    return result.stdout;
  },
  now = Date.now,
} = {}) {
  function searchArgs(command, query, limit) {
    return dialect === 'adapter'
      ? [command, query, String(limit)]
      : [command, query, '--limit', String(limit)];
  }

  async function run(args, timeoutMs = GBRAIN_TIMEOUT_MS) {
    const output = await execute(bin, args, {
      encoding: 'utf8',
      timeout: positiveTimeout(timeoutMs, GBRAIN_TIMEOUT_MS),
    });
    return String(output || '').trim();
  }

  async function getPageWithEvidence(slug, options = {}) {
    const startedAt = now();
    const page = parsePage(
      slug,
      await run(
        ['get', slug],
        positiveTimeout(options.timeoutMs, GBRAIN_TIMEOUT_MS)
      )
    );
    return { page, source: 'get', ms: Math.max(0, now() - startedAt) };
  }

  async function getPage(slug, options = {}) {
    return (await getPageWithEvidence(slug, options)).page;
  }

  async function resolveSearchSlugs(query, limit, timeoutMs) {
    const startedAt = now();
    const deadline = startedAt + timeoutMs;
    let keywordSucceeded = false;
    let keywordFailure = null;
    try {
      const keywordRaw = await run(
        searchArgs('search', query, limit),
        Math.min(KEYWORD_LOOKUP_TIMEOUT_MS, Math.max(1, deadline - now()))
      );
      keywordSucceeded = true;
      const slugs = parseSearchSlugs(keywordRaw).slice(0, limit);
      if (slugs.length > 0) return { slugs, source: 'keyword' };
    } catch (error) {
      keywordFailure = error;
    }

    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      if (keywordSucceeded) return { slugs: [], source: 'keyword' };
      throw lookupFailure([keywordFailure]);
    }

    try {
      const semanticRaw = await run(
        searchArgs('query', query, limit),
        remainingMs
      );
      return {
        slugs: parseSearchSlugs(semanticRaw).slice(0, limit),
        source: 'semantic',
      };
    } catch (semanticFailure) {
      if (keywordSucceeded) return { slugs: [], source: 'keyword' };
      throw lookupFailure([keywordFailure, semanticFailure]);
    }
  }

  async function searchPagesWithEvidence(query, limit = 3, options = {}) {
    const timeoutMs = positiveTimeout(
      options.timeoutMs,
      CONTEXT_LOOKUP_TIMEOUT_MS
    );
    const startedAt = now();
    const deadline = startedAt + timeoutMs;
    const { slugs, source } = await resolveSearchSlugs(query, limit, timeoutMs);
    const pages = [];
    for (const slug of slugs) {
      const remainingMs = deadline - now();
      if (remainingMs <= 0)
        throw new Error('gbrain-context-lookup-deadline-exceeded');
      pages.push(
        (await getPageWithEvidence(slug, { timeoutMs: remainingMs })).page
      );
    }
    return { pages, source, ms: Math.max(0, now() - startedAt) };
  }

  async function searchPages(query, limit = 3, options = {}) {
    return (await searchPagesWithEvidence(query, limit, options)).pages;
  }

  return Object.freeze({
    getPage,
    getPageWithEvidence,
    searchPages,
    searchPagesWithEvidence,
  });
}

const defaultClient = createGbrainClient();

export const getPage = defaultClient.getPage;
export const searchPages = defaultClient.searchPages;
export const cliGbrainClient = defaultClient;

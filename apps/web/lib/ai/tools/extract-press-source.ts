import { extractMetaContent } from '@/lib/ingestion/strategies/base/parsing';
import { sanitizeText } from './extract-bio-candidate';
import { wrapUntrustedSourceContent } from './untrusted-source-fence';

export const PRESS_SOURCE_HEADLINE_MAX_LENGTH = 200;
export const PRESS_SOURCE_BODY_MAX_LENGTH = 2_000;
export const PRESS_SOURCE_FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

export type PressSourceFreshness =
  | 'fresh'
  | 'stale'
  | 'future_dated'
  | 'missing_date';

export type PressSourceDateSource =
  | 'article:published_time'
  | 'jsonld:datePublished'
  | 'meta:datePublished';

const ARTICLE_JSON_LD_TYPES = new Set([
  'Article',
  'BlogPosting',
  'NewsArticle',
  'PressRelease',
  'Report',
]);

const FRESHNESS_DISCLAIMER =
  'Freshness is source-clock recency only. It does not imply the article is true, complete, or independently verified.';

interface JsonLdNode {
  '@type'?: unknown;
  '@graph'?: unknown;
  headline?: unknown;
  name?: unknown;
  datePublished?: unknown;
  articleBody?: unknown;
  description?: unknown;
}

function asNodes(node: unknown): JsonLdNode[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(asNodes);
  if (typeof node !== 'object') return [];
  const obj = node as JsonLdNode;
  return obj['@graph'] ? [obj, ...asNodes(obj['@graph'])] : [obj];
}

function schemaTypes(type: unknown): string[] {
  const values = Array.isArray(type) ? type : [type];
  return values.flatMap(value =>
    typeof value === 'string' ? [value.replace(/^.*[/:]/, '')] : []
  );
}

function firstString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim()) return entry.trim();
    }
  }
  return null;
}

function jsonLdArticles(html: string): JsonLdNode[] {
  const blockPattern =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const articles: JsonLdNode[] = [];
  for (const match of html.matchAll(blockPattern)) {
    const raw = match[1];
    if (!raw) continue;
    try {
      for (const node of asNodes(JSON.parse(raw.trim()))) {
        if (
          schemaTypes(node['@type']).some(t => ARTICLE_JSON_LD_TYPES.has(t))
        ) {
          articles.push(node);
        }
      }
    } catch {
      continue;
    }
  }
  return articles;
}

function parseDate(raw: string): Date | null {
  const ms = Date.parse(raw.trim());
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function classifyPressSourceFreshness(
  publishedAt: Date | null,
  now: Date
): PressSourceFreshness {
  if (!publishedAt) return 'missing_date';
  if (publishedAt.getTime() > now.getTime()) return 'future_dated';
  if (now.getTime() - publishedAt.getTime() > PRESS_SOURCE_FRESH_WINDOW_MS) {
    return 'stale';
  }
  return 'fresh';
}

function publishedTimestamp(
  html: string,
  articles: JsonLdNode[]
): { iso: string; source: PressSourceDateSource } | null {
  const candidates: Array<{ raw: string; source: PressSourceDateSource }> = [];
  const articlePublished = extractMetaContent(html, 'article:published_time');
  if (articlePublished) {
    candidates.push({
      raw: articlePublished,
      source: 'article:published_time',
    });
  }
  for (const article of articles) {
    const jsonLdPublished = firstString(article.datePublished);
    if (jsonLdPublished) {
      candidates.push({
        raw: jsonLdPublished,
        source: 'jsonld:datePublished',
      });
      break;
    }
  }
  const metaPublished = extractMetaContent(html, 'datePublished');
  if (metaPublished) {
    candidates.push({ raw: metaPublished, source: 'meta:datePublished' });
  }
  for (const candidate of candidates) {
    const date = parseDate(candidate.raw);
    if (date) return { iso: date.toISOString(), source: candidate.source };
  }
  return null;
}

function headlineFrom(html: string, articles: JsonLdNode[]): string | null {
  const meta =
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title');
  if (meta) return meta;
  for (const article of articles) {
    const headline = firstString(article.headline) ?? firstString(article.name);
    if (headline) return headline;
  }
  return /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)?.[1]?.trim() || null;
}

function bodyFrom(html: string, articles: JsonLdNode[]): string | null {
  for (const article of articles) {
    const body =
      firstString(article.articleBody) ?? firstString(article.description);
    if (body) return body;
  }
  const region =
    /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1] ??
    /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ??
    html;
  const stripped = region
    .replaceAll(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replaceAll(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replaceAll(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replaceAll(/<[^>]+>/g, ' ')
    .trim();
  return stripped || null;
}

export function extractPressSourceEvidence(html: string) {
  const articles = jsonLdArticles(html);
  const published = publishedTimestamp(html, articles);
  const headlineRaw = headlineFrom(html, articles);
  const bodyRaw = bodyFrom(html, articles);
  return {
    headline: headlineRaw
      ? sanitizeText(headlineRaw, PRESS_SOURCE_HEADLINE_MAX_LENGTH) || null
      : null,
    body: bodyRaw
      ? sanitizeText(bodyRaw, PRESS_SOURCE_BODY_MAX_LENGTH) || null
      : null,
    publishedAt: published?.iso ?? null,
    publishedAtSource: published?.source ?? null,
  };
}

export function inspectPressSourceHtml(
  html: string,
  sourceUrl: string,
  now: Date = new Date()
) {
  const evidence = extractPressSourceEvidence(html);
  const publishedAtDate = evidence.publishedAt
    ? new Date(evidence.publishedAt)
    : null;
  return {
    sourceUrl,
    inspectedAt: now.toISOString(),
    contentTrust: 'untrusted',
    factualVerification: false,
    freshnessDisclaimer: FRESHNESS_DISCLAIMER,
    freshness: classifyPressSourceFreshness(publishedAtDate, now),
    freshnessWindowMs: PRESS_SOURCE_FRESH_WINDOW_MS,
    publishedAt: evidence.publishedAt,
    publishedAtSource: evidence.publishedAtSource,
    headline: evidence.headline
      ? wrapUntrustedSourceContent(evidence.headline, sourceUrl)
      : null,
    bodyEvidence: evidence.body
      ? wrapUntrustedSourceContent(evidence.body, sourceUrl)
      : null,
  };
}

export function hasPressSourceEvidence(inspection: {
  headline: string | null;
  bodyEvidence: string | null;
}): boolean {
  return Boolean(inspection.headline || inspection.bodyEvidence);
}

/**
 * Wikidata QID from MusicBrainz url-rels, then Wikimedia pageviews.
 * This module does not fetch Wikipedia HTML.
 */
import type { MusicBrainzRelation } from '@/lib/dsp-enrichment/types';

const WIKIDATA_QID = /wikidata\.org\/(?:wiki|entity)\/(Q\d+)\b/i;
const QID = /^Q\d+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function extractWikidataQid(
  relations: readonly MusicBrainzRelation[] | undefined
): string | null {
  for (const relation of relations ?? []) {
    const resource = relation.url?.resource;
    if (!resource) continue;
    const match = WIKIDATA_QID.exec(resource);
    if (match?.[1]) return match[1];
  }
  return null;
}
export function wikidataSitelinksUrl(qid: string): string {
  if (!QID.test(qid)) {
    throw new Error('Invalid Wikidata QID');
  }
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', qid);
  url.searchParams.set('props', 'sitelinks');
  url.searchParams.set('sitefilter', 'enwiki');
  url.searchParams.set('format', 'json');
  return url.toString();
}
export function readEnwikiTitle(payload: unknown, qid: string): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const entities = (payload as { entities?: unknown }).entities;
  if (!entities || typeof entities !== 'object') return null;
  const entity = (entities as Record<string, unknown>)[qid];
  if (!entity || typeof entity !== 'object') return null;
  const sitelinks = (entity as { sitelinks?: unknown }).sitelinks;
  if (!sitelinks || typeof sitelinks !== 'object') return null;
  const enwiki = (sitelinks as { enwiki?: unknown }).enwiki;
  if (!enwiki || typeof enwiki !== 'object') return null;
  const title = (enwiki as { title?: unknown }).title;
  if (typeof title !== 'string') return null;
  const trimmed = title.trim();
  if (!trimmed || trimmed.length > 300) return null;
  return trimmed;
}
export function wikimediaPageviewsUrl(article: string, day: string): string {
  if (!DAY.test(day)) throw new Error('Invalid pageview day');
  const title = encodeURIComponent(article.replace(/ /g, '_'));
  const compact = day.replaceAll('-', '');
  return `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${title}/daily/${compact}/${compact}`;
}
export function readPageviews(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const views = (items[0] as { views?: unknown }).views;
  if (typeof views !== 'number' || !Number.isSafeInteger(views) || views < 0) {
    return null;
  }
  return views;
}

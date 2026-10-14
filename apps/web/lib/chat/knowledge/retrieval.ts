import { selectKnowledgeContext } from '@/lib/chat/knowledge/router';
import { type GbrainSearchResult, searchPages } from '@/lib/wiki/gbrain-client';

const MAX_GBRAIN_RESULTS = 6;
const MAX_EXCERPT_CHARS = 1200;
const MAX_QUERY_CHARS = 3000;

function isCurated(hit: GbrainSearchResult): boolean {
  return hit.chunk_source === 'compiled_truth';
}

function safeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function safeExcerpt(value: string): string {
  return value
    .trim()
    .slice(0, MAX_EXCERPT_CHARS)
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatBundledCanonContext(context: string): string {
  if (!context) return '';
  return `<knowledge-source id="K1" title="Jovie music industry canon" slug="bundled/music-industry-canon" confidence="authoritative">
<untrusted-knowledge>${context.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</untrusted-knowledge>
</knowledge-source>`;
}

function isUsableHit(hit: GbrainSearchResult): boolean {
  return (
    typeof hit?.slug === 'string' &&
    hit.slug.trim().length > 0 &&
    typeof hit.title === 'string' &&
    hit.title.trim().length > 0 &&
    typeof hit.chunk_text === 'string' &&
    hit.chunk_text.trim().length > 0
  );
}

/**
 * Formats gbrain's hybrid-ranked chunks for the model. Compiled truth stays
 * ahead of lower-confidence raw/timeline evidence, while preserving gbrain's
 * RRF order inside each tier.
 */
export function formatKnowledgeContext(
  hits: readonly GbrainSearchResult[]
): string {
  const usable = hits.filter(isUsableHit);
  const ordered = [
    ...usable.filter(isCurated),
    ...usable.filter(hit => !isCurated(hit)),
  ].slice(0, MAX_GBRAIN_RESULTS);

  return ordered
    .map((hit, index) => {
      const id = `K${index + 1}`;
      const confidence = isCurated(hit) ? 'authoritative' : 'uncurated';
      return `<knowledge-source id="${id}" title="${safeAttribute(hit.title)}" slug="${safeAttribute(hit.slug)}" confidence="${confidence}">
<untrusted-knowledge>${safeExcerpt(hit.chunk_text ?? '')}</untrusted-knowledge>
</knowledge-source>`;
    })
    .join('\n\n');
}

/**
 * Retrieves music-industry context from gbrain's pgvector + full-text hybrid
 * query. Empty/error responses fail softly to the bundled topic canon so a
 * knowledge outage never prevents the artist from using chat.
 */
export async function retrieveKnowledgeContext(
  query: string,
  signal?: AbortSignal,
  retrieve: typeof searchPages = searchPages
): Promise<string> {
  const normalized = query.trim().slice(0, MAX_QUERY_CHARS);
  if (normalized.length < 3) return '';

  const hits = await retrieve(normalized, MAX_GBRAIN_RESULTS, signal);
  return (
    formatKnowledgeContext(hits) ||
    formatBundledCanonContext(selectKnowledgeContext(normalized))
  );
}

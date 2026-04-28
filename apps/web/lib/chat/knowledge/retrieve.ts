import { type CanonDoc, type CanonTag, getCanonDocs } from './canon-loader';
import { EmbedError, embed } from './embed';

/**
 * Top-k canon docs to retrieve before threshold filtering.
 * Small corpus (~10 docs) → favor recall; the threshold cuts noise.
 */
const TOP_K = 5;

/**
 * Minimum cosine similarity score for a canon doc to be retrieved.
 * Tunable per-deployment via the `?retrieval_threshold=` query param
 * (admin-only, see chat route). 0.7 was chosen from the existing keyword
 * router's MIN_SCORE = 2 producing similar precision in pilot tests.
 */
export const DEFAULT_MIN_SCORE = 0.7;

/**
 * Tag boost: if the user query mentions one of a doc's tags, add this
 * to its similarity score before the threshold filter. Lets niche docs
 * beat slightly-better-but-off-topic generic docs.
 */
const TAG_BOOST = 0.05;

export interface RetrievedCanon {
  path: string;
  title: string;
  claim: string;
  tags: readonly CanonTag[];
  score: number;
  sourceUrl: string | null;
}

export interface RetrievalResult {
  /** Markdown context block to inject into the system prompt (empty when no docs cleared threshold). */
  contextText: string;
  /** Retrieved docs in score-descending order. Empty when retrieval found nothing relevant. */
  retrieved: RetrievedCanon[];
  /** Latency of the embedding call + cosine search, ms. */
  latencyMs: number;
  /** Embedding model used for the query. Useful for trace persistence. */
  embeddingModel: string | null;
  /** When NIM was unavailable, retrieval returns empty + this is true. Caller can degrade UI. */
  empty: true | false;
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function findTagsInQuery(
  query: string,
  docTags: readonly CanonTag[]
): readonly CanonTag[] {
  const lower = query.toLowerCase();
  return docTags.filter(tag => {
    const normalized = tag.replace(/-/g, ' ');
    return lower.includes(normalized) || lower.includes(tag);
  });
}

function buildContextText(
  retrieved: RetrievedCanon[],
  docs: readonly CanonDoc[]
): string {
  if (retrieved.length === 0) return '';
  const byPath = new Map(docs.map(d => [d.path, d] as const));
  const sections: string[] = [];
  for (const r of retrieved) {
    const doc = byPath.get(r.path);
    if (!doc) continue;
    sections.push(
      `## ${doc.title}\n\n${doc.body.trim()}\n\n_Source canon: ${doc.path} (score ${r.score.toFixed(2)})_`
    );
  }
  return sections.join('\n\n---\n\n');
}

export interface RetrieveOptions {
  /** Override the default min-score threshold (admin/dev escape hatch). */
  minScore?: number;
  /** Override the default top-k (rarely needed). */
  topK?: number;
}

/**
 * Retrieve canon docs relevant to a user query.
 *
 * Returns `{ retrieved: [], contextText: '', empty: true }` when:
 *  - NIM is rate-limiting / down
 *  - No doc clears the min-score threshold
 *
 * In both cases the chat continues — Sonnet falls back to its training
 * or invokes an artist-data tool. There is intentionally no keyword
 * fallback (mixing keyword + vector retrieval breaks debuggability).
 */
export async function retrieveCanonContext(
  query: string,
  options: RetrieveOptions = {}
): Promise<RetrievalResult> {
  const start = Date.now();
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const topK = options.topK ?? TOP_K;

  const trimmed = query.trim();
  if (!trimmed) {
    return {
      contextText: '',
      retrieved: [],
      latencyMs: 0,
      embeddingModel: null,
      empty: true,
    };
  }

  const docs = await getCanonDocs();
  if (docs.length === 0) {
    return {
      contextText: '',
      retrieved: [],
      latencyMs: Date.now() - start,
      embeddingModel: null,
      empty: true,
    };
  }

  let queryEmbedding: number[];
  let embeddingModel: string;
  try {
    const result = await embed(trimmed, {
      kind: 'query',
      inputType: 'query',
    });
    queryEmbedding = result.embedding;
    embeddingModel = result.model;
  } catch (err) {
    // NIM down / rate-limited → graceful empty. The Sentry breadcrumb
    // is already emitted from inside `embed()`; we don't double-log.
    if (err instanceof EmbedError) {
      return {
        contextText: '',
        retrieved: [],
        latencyMs: Date.now() - start,
        embeddingModel: null,
        empty: true,
      };
    }
    throw err;
  }

  // Score every doc, apply tag boost, threshold-filter, top-k.
  const scored = docs
    .map(doc => {
      const baseScore = cosine(queryEmbedding, doc.embedding);
      const matchedTags = findTagsInQuery(trimmed, doc.tags);
      const boost = matchedTags.length > 0 ? TAG_BOOST : 0;
      return {
        doc,
        score: baseScore + boost,
        baseScore,
      };
    })
    .filter(s => s.baseScore > 0); // ignore degenerate cosine=0

  scored.sort((a, b) => b.score - a.score);

  const retrieved: RetrievedCanon[] = [];
  for (const s of scored.slice(0, topK)) {
    if (s.score < minScore) break;
    retrieved.push({
      path: s.doc.path,
      title: s.doc.title,
      claim: s.doc.claim,
      tags: s.doc.tags,
      score: Number(s.score.toFixed(4)),
      sourceUrl: s.doc.sourceUrl,
    });
  }

  return {
    contextText: buildContextText(retrieved, docs),
    retrieved,
    latencyMs: Date.now() - start,
    embeddingModel,
    empty: retrieved.length === 0,
  };
}

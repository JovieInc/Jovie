import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { resolveAppPath } from '@/lib/filesystem-paths';
import { DEFAULT_EMBEDDING_MODEL, EmbedError, embed } from './embed';

/**
 * Closed vocabulary for canon doc tags. Open-vocabulary tags would
 * silently break tag-boost in retrieval (typos won't match anything).
 * Add a value here to expose it to canon authors.
 */
export const CANON_TAGS = [
  'playlists',
  'editorial',
  'spotify',
  'apple-music',
  'pitching',
  'release',
  'timing',
  'rollout',
  'distribution',
  'metrics',
  'streams',
  'engagement',
  'algorithms',
  'profile',
  'bio',
  'branding',
  'discoverability',
  'marketing',
  'promotion',
  'ads',
  'fan-capture',
  'dsps',
  'metadata',
  'delivery',
  'royalties',
  'monetization',
  'sync',
  'merch',
  'rights',
  'publishing',
  'pre-saves',
  'tour',
  'creator-campaigns',
] as const;

export type CanonTag = (typeof CANON_TAGS)[number];

const frontmatterSchema = z.object({
  title: z.string().min(1).max(60),
  claim: z.string().min(10).max(400),
  tags: z.array(z.enum(CANON_TAGS)).min(1).max(8),
  source_url: z.string().url().optional(),
});

type Frontmatter = z.infer<typeof frontmatterSchema>;

export interface CanonDoc {
  /** Path relative to apps/web/lib/chat/knowledge/canon/ (e.g. `playlist-strategy.md`). */
  path: string;
  title: string;
  claim: string;
  tags: readonly CanonTag[];
  sourceUrl: string | null;
  /** Full file content (after frontmatter) — passed to the model as context. */
  body: string;
  /** sha256(file_content) — used for embedding cache key + version hash inputs. */
  fileSha: string;
  embedding: number[];
  embeddingModel: string;
}

const CANON_DIR = resolveAppPath('lib', 'chat', 'knowledge', 'canon');

function parseFrontmatter(
  raw: string,
  filePath: string
): {
  meta: Frontmatter;
  body: string;
} {
  if (!raw.startsWith('---\n')) {
    throw new Error(
      `Canon doc ${filePath} missing frontmatter (must start with '---\\n')`
    );
  }
  const end = raw.indexOf('\n---', 4);
  if (end === -1) {
    throw new Error(`Canon doc ${filePath} has unclosed frontmatter`);
  }
  const fmText = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\n+/, '');

  // Minimal YAML parser for our frontmatter shape:
  //   title: "..."        OR  title: ...
  //   claim: "..."
  //   tags: [foo, bar]
  //   source_url: "https://..."
  // Multi-line values are NOT supported — keep frontmatter compact.
  const meta: Record<string, unknown> = {};
  for (const rawLine of fmText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Array form: tags: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      meta[key] = value
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    }

    // Quoted scalar: "..." or '...'
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    meta[key] = value;
  }

  const result = frontmatterSchema.safeParse(meta);
  if (!result.success) {
    throw new Error(
      `Canon doc ${filePath} has invalid frontmatter: ${result.error.flatten().fieldErrors ? JSON.stringify(result.error.flatten().fieldErrors) : result.error.message}`
    );
  }

  return { meta: result.data, body };
}

function fileSha(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

interface RawCanonEntry {
  path: string;
  raw: string;
  meta: Frontmatter;
  body: string;
  fileSha: string;
}

function readAllCanonFiles(): RawCanonEntry[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(CANON_DIR);
  } catch (err) {
    Sentry.addBreadcrumb({
      category: 'chat.canon.readdir_failed',
      level: 'warning',
      data: { error: String(err), dir: CANON_DIR },
    });
    return [];
  }

  const result: RawCanonEntry[] = [];
  for (const name of entries) {
    if (!name.endsWith('.md')) continue;
    if (name.startsWith('_')) continue; // skip _template.md and friends
    const fullPath = join(CANON_DIR, name);
    try {
      const stats = statSync(fullPath);
      if (!stats.isFile()) continue;
      const raw = readFileSync(fullPath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw, name);
      result.push({
        path: name,
        raw,
        meta,
        body,
        fileSha: fileSha(raw),
      });
    } catch (err) {
      // Throw at module load — bad canon shouldn't ship silently. Better
      // to fail loudly during deploy than fall back to no context.
      throw err instanceof Error
        ? err
        : new Error(`Failed to load canon ${name}: ${String(err)}`);
    }
  }
  // Deterministic order by file path (governs retrieval-version hash inputs).
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

let _docs: readonly CanonDoc[] | null = null;
let _docsPromise: Promise<readonly CanonDoc[]> | null = null;
let _canonCorpusSha: string | null = null;

async function loadCanonOnce(): Promise<readonly CanonDoc[]> {
  const entries = readAllCanonFiles();
  // Compute the corpus-level SHA before any embedding so RETRIEVAL_VERSION
  // is computable even when NIM is unavailable.
  _canonCorpusSha = createHash('sha256')
    .update(entries.map(e => `${e.path}:${e.fileSha}`).join('|'))
    .digest('hex')
    .slice(0, 16);

  const docs: CanonDoc[] = [];
  for (const entry of entries) {
    try {
      const result = await embed(entry.body, {
        kind: 'doc',
        inputType: 'passage',
      });
      docs.push({
        path: entry.path,
        title: entry.meta.title,
        claim: entry.meta.claim,
        tags: entry.meta.tags,
        sourceUrl: entry.meta.source_url ?? null,
        body: entry.body,
        fileSha: entry.fileSha,
        embedding: result.embedding,
        embeddingModel: result.model,
      });
    } catch (err) {
      // Skip individual canon docs that fail to embed (NIM rate limit on
      // cold deploy, transient network). A doc without an embedding
      // simply isn't retrievable until the next cold start succeeds —
      // chat continues to function without that doc.
      if (err instanceof EmbedError) {
        Sentry.addBreadcrumb({
          category: 'chat.canon.embed_skipped',
          level: 'warning',
          data: {
            path: entry.path,
            upstream_status: err.upstreamStatus ?? null,
            retry_after_ms: err.retryAfterMs ?? null,
          },
        });
      } else {
        Sentry.captureException(err, {
          tags: { feature: 'ai-chat', subsystem: 'canon-loader' },
          extra: { path: entry.path },
        });
      }
    }
  }
  return docs;
}

/**
 * Returns the in-memory canon corpus, embedding it on first call.
 *
 * In production: pre-warms once at module load (top-level await in run.ts)
 * so the first user request doesn't pay the embed latency.
 *
 * In dev: re-reads files on every call so canon edits are visible without
 * a server restart.
 */
export async function getCanonDocs(): Promise<readonly CanonDoc[]> {
  if (process.env.NODE_ENV !== 'production') {
    // Dev hot-reload: skip the cached promise so file edits are visible.
    return loadCanonOnce();
  }
  if (_docs) return _docs;
  if (_docsPromise) return _docsPromise;
  _docsPromise = loadCanonOnce()
    .then(docs => {
      _docs = docs;
      return docs;
    })
    .catch(err => {
      _docsPromise = null;
      throw err;
    });
  return _docsPromise;
}

/**
 * Pre-warms the canon corpus. Called at chat module load so the first
 * user request after a deploy doesn't pay the embed cost.
 */
export async function prewarmCanon(): Promise<void> {
  await getCanonDocs();
}

/**
 * Stable hash of (file path → file SHA) for every canon doc. Goes into
 * `RETRIEVAL_VERSION` so canon edits bump the version automatically.
 */
export function getCanonCorpusSha(): string {
  if (_canonCorpusSha) return _canonCorpusSha;
  // If `getCanonDocs` hasn't been awaited yet, compute it synchronously
  // from raw files (we don't need embeddings for this).
  const entries = readAllCanonFiles();
  _canonCorpusSha = createHash('sha256')
    .update(entries.map(e => `${e.path}:${e.fileSha}`).join('|'))
    .digest('hex')
    .slice(0, 16);
  return _canonCorpusSha;
}

export const __INTERNAL_FOR_TESTS__ = {
  parseFrontmatter,
  CANON_DIR,
  defaultEmbeddingModel: DEFAULT_EMBEDDING_MODEL,
};

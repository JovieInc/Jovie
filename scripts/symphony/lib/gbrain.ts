/**
 * Shared gbrain client for Hermes cron jobs — the TS mirror of
 * `~/.hermes/scripts/lib/gbrain_mem.py`. Lets the always-on jobs both READ prior
 * knowledge (recall) and WRITE durable learnings (learn) so findings compound
 * across runs instead of being re-derived (or re-filed) every cron tick.
 *
 * Every call soft-degrades: gbrain being down returns '' / false, never throws —
 * a cron job must never block on the memory layer.
 */
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

const GBRAIN = process.env.HERMES_GBRAIN_BIN ?? 'gbrain';

/** Stable slug from arbitrary text (mirrors gbrain_mem.slugify). */
export function gbrainSlug(s: string, maxLen = 60): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLen) || 'untitled'
  );
}

/**
 * Return relevant prior knowledge for `query`, or '' if gbrain is down. One
 * `gbrain search` call (semantic relevance). Generous timeout — fine for crons,
 * never interactive. Never throws.
 */
export function gbrainRecall(
  query: string,
  limit = 5,
  maxChars = 3000
): string {
  if (!query.trim()) return '';
  try {
    const out = execFileSync(
      GBRAIN,
      ['search', query, '--limit', String(limit)],
      {
        encoding: 'utf8',
        timeout: 30_000,
      }
    ).trim();
    if (!out || out.slice(0, 60).toLowerCase().includes('failed')) return '';
    return out.length > maxChars
      ? `${out.slice(0, maxChars)}\n[truncated]`
      : out;
  } catch {
    return '';
  }
}

/**
 * Idempotent upsert of a gbrain page (mirrors gbrain_mem.learn — `gbrain put <slug>`
 * with frontmatter). A deterministic slug means a recurring finding overwrites its
 * page instead of duplicating. Returns true on success, false if gbrain is down.
 * Never throws.
 */
export function gbrainLearn(args: {
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly tags?: readonly string[];
  readonly type?: string;
}): boolean {
  if (!args.slug || !args.title) return false;
  const tags = [...new Set(args.tags ?? [])].sort().join(', ');
  const page =
    `---\ntitle: ${args.title}\ntype: ${args.type ?? 'learning'}\n` +
    `tags: [${tags}]\ncreated: ${new Date().toISOString()}\n---\n\n${args.body.trim()}\n`;
  try {
    execFileSync(GBRAIN, ['put', args.slug], {
      input: page,
      encoding: 'utf8',
      timeout: 25_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Append free-form content to the brain inbox (auto-slugged) and return its id.
 * Used by ingestion jobs (e.g. voice memos) where the content is a stream, not a
 * keyed page. Throws on failure (the caller decides whether that's fatal).
 */
export function gbrainIngest(args: {
  readonly text: string;
  readonly tags: readonly string[];
}): string {
  const out = execFileSync(
    GBRAIN,
    ['ingest', '--tags', args.tags.join(','), '--stdin-text', '--print-id'],
    { encoding: 'utf8', input: args.text, timeout: 30_000 }
  );
  const id = out.trim();
  if (!id) throw new Error('gbrain ingest returned empty id');
  return id;
}

export { basename as gbrainBasename };

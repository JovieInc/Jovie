import { vi } from 'vitest';

const TABLE_NAME = Symbol.for('drizzle:Name');

type SqlChunk = {
  name?: string;
  table?: { [TABLE_NAME]?: string };
  queryChunks?: unknown[];
  value?: unknown;
};

/**
 * Flattens a drizzle SQL expression (from `and`/`eq`/`isNull`/`desc`/`sql`)
 * into a single token string: column names render as `table.column`, string
 * chunks and bound values render verbatim. Mirrors the established
 * drizzle-predicate walker so assertions read like the emitted SQL.
 */
export function sqlTokens(node: unknown): string {
  const parts: string[] = [];
  const visit = (value: unknown) => {
    if (value === null || value === undefined) return;
    // Drizzle inlines simple bound values as raw primitives in queryChunks.
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(String(value));
      return;
    }
    if (typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    const chunk = value as SqlChunk;
    const table = chunk.table?.[TABLE_NAME];
    if (typeof chunk.name === 'string' && table) {
      parts.push(`${table}.${chunk.name}`);
      return;
    }
    if (chunk.queryChunks) {
      visit(chunk.queryChunks);
      return;
    }
    if ('value' in chunk) {
      parts.push(
        Array.isArray(chunk.value) ? chunk.value.join('') : String(chunk.value)
      );
    }
  };
  visit(node);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

type ReleaseRowShape = {
  id: string;
  title: string;
  releaseType: string;
  releaseDate: Date | string | null;
  artworkUrl: string | null;
  spotifyPopularity: number | null;
  totalTracks: number;
  metadata: Record<string, unknown> | null;
};

export const releaseRow = {
  id: 'release-1',
  title: 'Midnight',
  releaseType: 'single',
  releaseDate: new Date('2026-01-01T00:00:00.000Z'),
  artworkUrl: null,
  spotifyPopularity: 12,
  totalTracks: 1,
  upc: '0123456789012',
  label: 'Night Records',
  distributor: 'Symphonic',
  metadata: {},
};

export const linkRow = {
  provider: 'Spotify',
  url: 'https://open.spotify.com/album/1',
  isPrimary: true,
};

export function sliceRowCompat(title = 'Loaded Title'): ReleaseRowShape {
  return { ...releaseRow, title };
}

export function makeChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

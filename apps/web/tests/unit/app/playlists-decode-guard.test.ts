/**
 * Guard test: public playlist hub pages must not crash on malformed
 * percent-encoding in the path segment.
 *
 * The genre/[genre] and mood/[mood] pages take user-controlled path segments
 * (e.g. /playlists/genre/%25ZZ, where `%25` decodes to a literal `%` that
 * Next.js passes through). Calling `decodeURIComponent` directly on such a
 * value throws `URIError: URI malformed`, surfacing as a 500 to the fan.
 *
 * Both pages must route path segments through `safeDecodeURIPathComponent`
 * (which is like `safeDecodeURIComponent` but does NOT replace `+` with a
 * space — form-encoding is a query-string convention, not a path one, so a
 * literal `+` in a tag like "rock+roll" must survive).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  safeDecodeURIComponent,
  safeDecodeURIPathComponent,
} from '@/lib/utils/string-utils';

const TEST_DIR = dirname(
  import.meta.url.startsWith('file:')
    ? fileURLToPath(import.meta.url)
    : import.meta.url
);

const GENRE_PAGE = join(
  TEST_DIR,
  '../../../app/(dynamic)/playlists/genre/[genre]/page.tsx'
);
const MOOD_PAGE = join(
  TEST_DIR,
  '../../../app/(dynamic)/playlists/mood/[mood]/page.tsx'
);

describe('public playlist hub pages — malformed URL decoding', () => {
  it('safeDecodeURIPathComponent does not throw on malformed percent-encoding', () => {
    // Sanity check on the path-safe helper the pages use.
    expect(() => safeDecodeURIPathComponent('%ZZ')).not.toThrow();
    expect(safeDecodeURIPathComponent('%ZZ')).toBe('%ZZ');
    expect(() => safeDecodeURIPathComponent('%')).not.toThrow();
    expect(() => safeDecodeURIPathComponent('%E0%A4')).not.toThrow(); // truncated
  });

  it('safeDecodeURIPathComponent preserves literal + in path segments', () => {
    // Regression: `+` is a form-encoding convention for query strings, NOT
    // path segments. A genre tag like "rock+roll" (encoded as %2B, decoded
    // to + by Next before the page runs) must stay "rock+roll", not become
    // "rock roll", or the DB contains-query returns no results.
    expect(safeDecodeURIPathComponent('rock+roll')).toBe('rock+roll');
    // Contrast with the query-string variant that does substitute:
    expect(safeDecodeURIComponent('rock+roll')).toBe('rock roll');
  });

  it('genre page uses path-safe decoder, not the form-encoding variant', () => {
    const source = readFileSync(GENRE_PAGE, 'utf8');
    expect(source).not.toMatch(/\bdecodeURIComponent\s*\(/);
    expect(source).toContain('safeDecodeURIPathComponent');
    expect(source).not.toMatch(/\bsafeDecodeURIComponent\b/);
  });

  it('mood page uses path-safe decoder, not the form-encoding variant', () => {
    const source = readFileSync(MOOD_PAGE, 'utf8');
    expect(source).not.toMatch(/\bdecodeURIComponent\s*\(/);
    expect(source).toContain('safeDecodeURIPathComponent');
    expect(source).not.toMatch(/\bsafeDecodeURIComponent\b/);
  });
});

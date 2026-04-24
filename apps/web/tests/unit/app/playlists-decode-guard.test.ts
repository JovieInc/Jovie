/**
 * Guard test: public playlist hub pages must not crash on malformed
 * percent-encoding in the path segment.
 *
 * The genre/[genre] and mood/[mood] pages take user-controlled path segments
 * (e.g. /playlists/genre/%25ZZ, where `%25` decodes to a literal `%` that
 * Next.js passes through). Calling `decodeURIComponent` directly on such a
 * value throws `URIError: URI malformed`, surfacing as a 500 to the fan.
 *
 * Both pages must route path segments through `safeDecodeURIComponent`
 * (or another non-throwing decoder) to degrade gracefully — the underlying
 * DB query returns no matches, and the page renders an empty-state.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { safeDecodeURIComponent } from '@/lib/utils/string-utils';

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
  it('safeDecodeURIComponent does not throw on malformed percent-encoding', () => {
    // Sanity check on the shared helper itself.
    expect(() => safeDecodeURIComponent('%ZZ')).not.toThrow();
    expect(safeDecodeURIComponent('%ZZ')).toBe('%ZZ');
    expect(() => safeDecodeURIComponent('%')).not.toThrow();
    expect(() => safeDecodeURIComponent('%E0%A4')).not.toThrow(); // truncated
  });

  it('genre page does not call decodeURIComponent directly', () => {
    const source = readFileSync(GENRE_PAGE, 'utf8');
    expect(source).not.toMatch(/\bdecodeURIComponent\s*\(/);
    expect(source).toContain('safeDecodeURIComponent');
  });

  it('mood page does not call decodeURIComponent directly', () => {
    const source = readFileSync(MOOD_PAGE, 'utf8');
    expect(source).not.toMatch(/\bdecodeURIComponent\s*\(/);
    expect(source).toContain('safeDecodeURIComponent');
  });
});

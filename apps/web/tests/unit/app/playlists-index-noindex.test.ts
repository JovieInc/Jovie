/**
 * Guard test: the /playlists index is an unlinked, music-only stub that only
 * renders a "Coming soon" empty state. Until it is either deleted or rebuilt
 * as a generalized creator-collections hub, it must stay out of the search
 * index (O-10 orphan / S-04 should-not-have-shipped, JOV-7602).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(
  import.meta.url.startsWith('file:')
    ? fileURLToPath(import.meta.url)
    : import.meta.url
);

const INDEX_PAGE = join(TEST_DIR, '../../../app/(dynamic)/playlists/page.tsx');

describe('/playlists index — noindex guard (JOV-7602)', () => {
  it('marks the index page with the shared NOINDEX_ROBOTS metadata', () => {
    const source = readFileSync(INDEX_PAGE, 'utf8');
    expect(source).toContain(
      "import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata'"
    );
    expect(source).toContain('robots: NOINDEX_ROBOTS');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('playlists index', () => {
  it('stays out of search indexes until a creator-generic collection exists', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/(dynamic)/playlists/page.tsx'),
      'utf8'
    );

    expect(source).toContain(
      "import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata'"
    );
    expect(source).toContain('robots: NOINDEX_ROBOTS');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { metadata } from './page';

describe('/claim canonical', () => {
  it('canonicalizes to /claim', () => {
    expect(metadata.alternates?.canonical).toBe('/claim');
  });

  it('provides a QueryClient for the claim artist search', () => {
    // ClaimArtistSearch consumes useArtistSearchQuery (TanStack Query), but
    // /claim has no layout of its own and the root layout provides no
    // QueryClientProvider. Rendering the hook unprovided throws "No QueryClient
    // set" during SSR, so the search control never mounts and the claim flow
    // is dead (claim dogfood red: run 43663532587). The page must wrap the
    // search in a scoped QueryClientProvider, like the homepage does.
    const source = readFileSync(
      resolve(process.cwd(), 'app/claim/page.tsx'),
      'utf8'
    );

    expect(source).toMatch(
      /import\s*\{\s*HomepageQueryProvider\s*\}\s*from\s*'\.{2}\/\(home\)\/HomepageQueryProvider';/
    );
    const wrapped = source.match(
      /<HomepageQueryProvider>[\s\S]*?<ClaimArtistSearch\s*\/>[\s\S]*?<\/HomepageQueryProvider>/
    );
    expect(wrapped).not.toBeNull();
  });

  it('cannot inherit a homepage canonical from the root layout', () => {
    // Metadata is inherited down the segment tree: a root `alternates` makes
    // every page that sets none declare itself a duplicate of the homepage.
    const rootLayout = readFileSync(
      resolve(process.cwd(), 'app/layout.tsx'),
      'utf8'
    );

    expect(rootLayout).not.toMatch(/^\s*alternates\s*:/m);
    expect(rootLayout).not.toMatch(/^\s*canonical\s*:/m);
  });
});

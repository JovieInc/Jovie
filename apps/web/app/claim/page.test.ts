import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { metadata } from './page';

describe('/claim canonical', () => {
  it('canonicalizes to /claim', () => {
    expect(metadata.alternates?.canonical).toBe('/claim');
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

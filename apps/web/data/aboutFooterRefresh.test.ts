import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLIC_COMMERCIAL_FOOTER_LINKS } from '@/data/marketingNavigation';

describe('about footer refresh copy', () => {
  it('links four to six commercial pages that exist on disk', () => {
    expect(PUBLIC_COMMERCIAL_FOOTER_LINKS.length).toBeGreaterThanOrEqual(4);
    expect(PUBLIC_COMMERCIAL_FOOTER_LINKS.length).toBeLessThanOrEqual(6);
    expect(PUBLIC_COMMERCIAL_FOOTER_LINKS.map(link => link.href)).toEqual([
      '/product',
      '/pricing',
      '/artist-profiles',
      '/smart-links',
    ]);

    for (const link of PUBLIC_COMMERCIAL_FOOTER_LINKS) {
      expect(link.href).not.toMatch(/stats/i);
      expect(
        existsSync(
          resolve(process.cwd(), `app/(marketing)${link.href}/page.tsx`)
        )
      ).toBe(true);
    }
  });
});

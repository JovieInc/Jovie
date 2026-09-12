import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// App-chrome brand contract: the browser-chrome metadata emitted by the root
// layout (Windows tile color, Safari pinned-tab mask-icon) must carry the
// canonical Jovie brand accent, not a retired placeholder hex.
// Canonical: lib/brand/tokens.ts (PALETTE.feature Ion / BRAND_ION_BLUE).

const layoutSource = readFileSync(
  resolve(process.cwd(), 'app/layout.tsx'),
  'utf8'
);
const brandTokensSource = readFileSync(
  resolve(process.cwd(), 'lib/brand/tokens.ts'),
  'utf8'
);

describe('root layout app-chrome brand colors', () => {
  it('emits the canonical Ion brand accent for tile and mask-icon chrome', () => {
    expect(layoutSource).toContain("'msapplication-TileColor': BRAND_ION_BLUE");
    expect(layoutSource).toMatch(
      /rel:\s*'mask-icon',\s*\n\s*url:\s*'\/favicon\.svg',\s*\n\s*color:\s*BRAND_ION_BLUE,/
    );
  });

  it('resolves BRAND_ION_BLUE to the canonical Ion palette hex', () => {
    expect(brandTokensSource).toMatch(
      /export const BRAND_ION_BLUE = '#11AFFF' as const;/
    );
    expect(brandTokensSource).toMatch(
      /\{\s*name:\s*'Ion',\s*hex:\s*'#11AFFF'\s*\}/
    );
  });

  it('does not reintroduce the retired indigo placeholder hex', () => {
    expect(layoutSource).not.toContain('#6366f1');
  });
});

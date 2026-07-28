import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const footerStylesPath = join(appRoot, 'components/site/MarketingFooter.css');

describe('MarketingFooterCta shared layout', () => {
  it('owns the CTA geometry outside the homepage route', async () => {
    const source = await readFile(footerStylesPath, 'utf8');

    expect(source).toContain('.homepage-story-final-cta');
    expect(source).toContain('min-height: clamp(22rem, 34vw, 30rem);');
    expect(source).toContain('.homepage-final-cta-copy');
    expect(source).toContain('width: min(100%, 42rem);');
    expect(source).toContain('.homepage-final-cta-action');
    expect(source).toContain('min-height: var(--space-11);');
  });
});

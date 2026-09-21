import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicLayoutSources = [
  'app/(home)/layout.tsx',
  'app/(marketing)/layout.tsx',
  'app/brand/layout.tsx',
] as const;

describe('public marketing shell inheritance', () => {
  it.each(publicLayoutSources)('mounts PublicPageShell for %s', sourcePath => {
    const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');

    expect(source).toContain("from '@/components/site/PublicPageShell'");
    expect(source).toContain('<PublicPageShell');
  });

  it('keeps the brand page on the homepage chrome while sharing the shell owner', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/brand/layout.tsx'),
      'utf8'
    );

    expect(source).toContain("headerVariant='homepage'");
    expect(source).toContain("footerVariant='expanded'");
    expect(source).toContain('mainOffset={false}');
    expect(source).not.toContain("from '@/components/site/MarketingHeader'");
    expect(source).not.toContain("from '@/components/site/MarketingFooter'");
    expect(source).not.toContain("from '@/components/atoms/SkipToContent'");
  });
});

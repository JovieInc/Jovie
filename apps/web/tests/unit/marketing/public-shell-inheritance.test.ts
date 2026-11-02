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

  it('bleeds the homepage hero under the docked shell header', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/(home)/layout.tsx'),
      'utf8'
    );

    expect(source).toContain('home-viewport--hero-canvas');
    // The canonical docked marketing header stays mounted and visible on
    // the homepage: the hero opts into .marketing-hero-dock bleed instead
    // of skipping the shell offset, which had hidden header-nav entirely.
    expect(source).not.toContain('mainOffset={false}');
    const hero = readFileSync(
      resolve(
        process.cwd(),
        'components/homepage/hero-light/HomepageHeroCanvas.tsx'
      ),
      'utf8'
    );
    expect(hero).toContain('marketing-hero-dock');
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

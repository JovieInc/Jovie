import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizePrerenderPathname } from '@/lib/navigation/use-public-pathname';

/**
 * Components that render on the prerendered homepage must read the pathname
 * through usePublicPathname(): raw usePathname() is "/index" on the server and
 * "/" in the browser, which caused React #418 on https://jov.ie/.
 */
const HOMEPAGE_PATHNAME_CONSUMERS = [
  'components/providers/Analytics.tsx',
  'components/providers/CoreProviders.tsx',
  'components/providers/InstantlyPixel.tsx',
  'components/site/MarketingPageContractMarkers.tsx',
  'components/site/MarketingHeader.tsx',
  'components/site/MarketingFooter.tsx',
  'components/molecules/MobileNav.tsx',
  'components/organisms/CookieBannerSection.tsx',
  'components/features/tracking/AcquisitionCapture.tsx',
  'components/features/tracking/EditorialRetargeting.tsx',
] as const;

describe('public pathname guard', () => {
  it.each(HOMEPAGE_PATHNAME_CONSUMERS)(
    '%s uses usePublicPathname, not raw usePathname',
    path => {
      const source = readFileSync(resolve(process.cwd(), path), 'utf8');
      expect(source).not.toMatch(/\busePathname\b/);
      expect(source).toContain('usePublicPathname');
    }
  );

  it('maps the prerender key "/index" to "/" and leaves other paths alone', () => {
    expect(normalizePrerenderPathname('/index')).toBe('/');
    expect(normalizePrerenderPathname('/indexes')).toBe('/indexes');
    expect(normalizePrerenderPathname('/pricing')).toBe('/pricing');
    expect(normalizePrerenderPathname(null)).toBeNull();
  });
});

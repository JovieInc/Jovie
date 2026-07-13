/**
 * SEO/AEO Ratchet Guardrail (JOV-11044)
 *
 * Ratchet principle: once a route is in ratchet-baseline.json, it can never
 * silently lose required SEO tags. Update the baseline only in intentional PRs.
 */
import { readFileSync } from 'node:fs';
import type { Metadata } from 'next';
import { describe, expect, it, vi } from 'vitest';
import {
  loadSeoRatchetBaseline,
  resolveSeoSourcePath,
  validateGenerateMetadataExport,
  validateRouteMetadata,
  validateSourceJsonLd,
  validateSourceMetadataPatterns,
} from '@/lib/seo/ratchet';
import * as homeRoute from '../../../app/(home)/page';
import * as aboutRoute from '../../../app/(marketing)/about/page';
import * as artistProfilesRoute from '../../../app/(marketing)/artist-profiles/page';
import * as blogRoute from '../../../app/(marketing)/blog/page';
import * as changelogRoute from '../../../app/(marketing)/changelog/page';
import * as downloadRoute from '../../../app/(marketing)/download/page';
import * as pricingRoute from '../../../app/(marketing)/pricing/layout';
import * as supportRoute from '../../../app/(marketing)/support/page';

// This suite validates route metadata, not page rendering. Keep render-only
// component graphs out of the metadata import path so the ratchet remains
// stable under the native 5s test timeout on a cold transform cache.
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('next/link', () => ({ default: () => null }));
vi.mock('next/cache', () => ({
  unstable_cache: (callback: unknown) => callback,
}));
vi.mock('@jovie/ui', () => ({ Badge: () => null, Button: () => null }));
vi.mock('@jovie/ui/atoms/badge', () => ({ Badge: () => null }));
vi.mock('lucide-react', () => ({
  ArrowDownToLine: () => null,
  Check: () => null,
  Laptop: () => null,
  QrCode: () => null,
  ShieldCheck: () => null,
  Smartphone: () => null,
  Sparkles: () => null,
}));
vi.mock('@/components/features/home/HomeTrustSection', () => ({
  HomeTrustSection: () => null,
}));
vi.mock('@/components/homepage/HomepageArtistOutcomes', () => ({
  HomepageArtistOutcomes: () => null,
}));
vi.mock('@/components/homepage/HomepageClosedLoop', () => ({
  HomepageClosedLoop: () => null,
}));
vi.mock('@/components/homepage/HomepageElectricSeam', () => ({
  HomepageElectricSeam: () => null,
}));
vi.mock('@/components/homepage/HomepageHeroCommandCenter', () => ({
  HomepageHeroCommandCenter: () => null,
}));
vi.mock('@/components/homepage/HomepageOpportunitySection', () => ({
  HomepageOpportunitySection: () => null,
}));
vi.mock('@/components/homepage/HomepagePosterHero', () => ({
  HomepagePosterHero: () => null,
}));
vi.mock('@/components/homepage/HomepageTrackedLink', () => ({
  HomepageTrackedLink: () => null,
}));
vi.mock('@/components/homepage/HomepageWorkspaceSectionLazy', () => ({
  HomepageWorkspaceSectionLazy: () => null,
}));
vi.mock('@/components/marketing', () => ({
  FaqSection: () => null,
  MarketingContainer: () => null,
  MarketingHeroLayout: () => null,
}));
vi.mock('@/features/home/AuthRedirectHandler', () => ({
  AuthRedirectHandler: () => null,
}));
vi.mock(
  '@/components/marketing/artist-profile/ArtistProfileLandingRoute',
  () => ({
    ArtistProfileLandingRoute: () => null,
  })
);
vi.mock('@/components/site/MarketingFooterCta', () => ({
  MarketingFooterCta: () => null,
}));
vi.mock('@/lib/screenshots/registry', () => ({
  getMarketingExportImage: () => '/test-marketing-export.png',
}));
vi.mock('@/lib/blog/getBlogPosts', () => ({ getBlogPosts: vi.fn() }));
vi.mock('@/lib/blog/resolveAuthor', () => ({ resolveAuthor: vi.fn() }));
vi.mock('@/lib/services/profile', () => ({
  getProfilesByUsernames: vi.fn(),
}));
vi.mock('../../../app/(marketing)/blog/components/BlogCard', () => ({
  BlogCard: () => null,
}));
vi.mock('../../../app/(marketing)/support/SupportContent', () => ({
  SupportChannels: () => null,
  SupportCta: () => null,
}));
vi.mock('../../../app/(marketing)/changelog/ChangelogEmailSignup', () => ({
  ChangelogEmailSignup: () => null,
}));

const baseline = loadSeoRatchetBaseline();

type RouteModule = {
  metadata?: Metadata;
  generateMetadata?: () => Promise<Metadata>;
};

async function loadRouteMetadata(
  routeModule: RouteModule
): Promise<Metadata | undefined> {
  if (routeModule.metadata) return routeModule.metadata;
  if (routeModule.generateMetadata) return routeModule.generateMetadata();
  return undefined;
}

const ROUTE_MODULES: Record<string, RouteModule> = {
  '/': homeRoute,
  '/about': aboutRoute,
  '/pricing': pricingRoute,
  '/support': supportRoute,
  '/artist-profiles': artistProfilesRoute,
  '/download': downloadRoute,
  '/blog': blogRoute,
  '/changelog': changelogRoute,
};

describe('SEO ratchet — baseline routes must never lose required tags (JOV-11044)', () => {
  for (const entry of baseline.routes) {
    it(`${entry.path} metadata matches baseline: ${entry.required.join(', ')}`, async () => {
      const routeModule = ROUTE_MODULES[entry.path];
      expect(
        routeModule,
        `Missing ROUTE_MODULES entry for ${entry.path}`
      ).toBeDefined();

      const metadata = await loadRouteMetadata(routeModule!);
      const issues = validateRouteMetadata(
        metadata,
        entry.required,
        entry.path
      );

      expect(issues, issues.map(issue => issue.message).join('\n')).toEqual([]);
    });

    it(`${entry.path} source wiring matches baseline`, () => {
      const source = readFileSync(
        resolveSeoSourcePath(entry.sourceFile),
        'utf8'
      );
      const issues = [
        ...validateSourceMetadataPatterns(source, entry.required, entry.path),
        ...(entry.jsonLd ? [validateSourceJsonLd(source, entry.path)] : []),
      ].filter((issue): issue is NonNullable<typeof issue> => issue !== null);

      expect(issues, issues.map(issue => issue.message).join('\n')).toEqual([]);
    });
  }
});

describe('SEO ratchet — profile/asset surfaces (JOV-11044)', () => {
  for (const surface of baseline.profileSurfaces) {
    it(`${surface.id} source keeps required SEO/AEO wiring`, () => {
      const source = readFileSync(
        resolveSeoSourcePath(surface.sourceFile),
        'utf8'
      );
      const issues = [
        ...(surface.requireGenerateMetadata
          ? validateGenerateMetadataExport(source, surface.id)
          : surface.required
            ? validateSourceMetadataPatterns(
                source,
                surface.required,
                surface.id
              )
            : []),
        ...(surface.jsonLd ? [validateSourceJsonLd(source, surface.id)] : []),
      ].filter((issue): issue is NonNullable<typeof issue> => issue !== null);

      expect(issues, issues.map(issue => issue.message).join('\n')).toEqual([]);
    });
  }
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GET as getLlmsTxt } from '@/app/llms.txt/route';
import { GET as getLlmsFull } from '@/app/llms-full.txt/route';
import manifest from '@/app/manifest';
import {
  ABOUT_FAQ_ITEMS,
  AboutPageContent,
} from '@/components/organisms/AboutPageContent';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { buildOrganizationSchema } from '@/lib/constants/schemas';
import {
  ARTIST_LABELED_IDENTITY_SURFACES,
  extractCompanyIdentityBlock,
  GENERAL_IDENTITY_SURFACES,
  isArtistOnlyCompanyDefinition,
  requiresSpotifyCatalogOrFollowers,
  SPECIALIST_API_IDENTITY_SURFACES,
} from '@/lib/marketing/company-identity-policy';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  page: vi.fn(),
}));

vi.mock('@/components/marketing/ProductScreenshotFrame', () => ({
  ProductScreenshotFrame: () => <div data-testid='product-screenshot-frame' />,
}));

const webRoot = process.cwd();

function readWebSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

describe('company identity route scope (JOV-6261 / JOV-6216 / JOV-6223)', () => {
  it('rejects a general artist-only company definition', () => {
    expect(
      isArtistOnlyCompanyDefinition(
        'Jovie is a release platform for independent musicians.'
      )
    ).toBe(true);
    expect(
      isArtistOnlyCompanyDefinition(
        'One link to launch your music career. Smart links, fan notifications, and AI for independent musicians.'
      )
    ).toBe(true);
    expect(
      isArtistOnlyCompanyDefinition(
        'Create your Jovie account to launch your artist profile, share smarter music links, and turn every release into momentum.'
      )
    ).toBe(true);
  });

  it('passes labeled music examples and specialist API limitations', () => {
    expect(
      isArtistOnlyCompanyDefinition(
        'For artists, that includes smart links for releases, fan capture, and notifications when new music drops.'
      )
    ).toBe(false);
    expect(
      isArtistOnlyCompanyDefinition(
        'The public artist API is read-only. GET /api/v1/{username} returns profile, releases, events, merch.'
      )
    ).toBe(false);
    expect(
      isArtistOnlyCompanyDefinition(
        'Jovie was founded by Tim White, a music marketing veteran who ran campaigns for artists like Tory Lanez.'
      )
    ).toBe(false);
  });

  it('does not require Spotify, catalog, or follower thresholds on shared templates', () => {
    expect(
      requiresSpotifyCatalogOrFollowers(COMPANY_IDENTITY.signupDescription)
    ).toBe(false);
    expect(
      requiresSpotifyCatalogOrFollowers(ABOUT_FAQ_ITEMS[4]?.answer ?? '')
    ).toBe(false);
  });

  it('keeps canonical identity aligned with the approved homepage SEO copy', () => {
    expect(COMPANY_IDENTITY.seoTitle).toBe(HOMEPAGE_LAUNCH_COPY.seo.title);
    expect(COMPANY_IDENTITY.seoDescription).toBe(
      HOMEPAGE_LAUNCH_COPY.seo.description
    );
    expect(COMPANY_IDENTITY.homepageHeadline).toBe(
      HOMEPAGE_LAUNCH_COPY.hero.headline
    );
  });

  it('renders About as a general company definition with a labeled artist example', () => {
    render(<AboutPageContent />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: COMPANY_IDENTITY.headline,
      })
    ).toBeVisible();
    expect(
      screen.getByText(COMPANY_IDENTITY.support, { exact: false })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 3, name: 'For Artists' })
    ).toBeVisible();
    expect(
      isArtistOnlyCompanyDefinition(
        `${COMPANY_IDENTITY.headline} ${COMPANY_IDENTITY.support} ${ABOUT_FAQ_ITEMS[0]?.answer}`
      )
    ).toBe(false);
  });

  it('uses general metadata, Open Graph, and Organization schema on /about', async () => {
    const { metadata } = await import('../../../app/(marketing)/about/page');
    const expectedTitle = `About — ${COMPANY_IDENTITY.headline.replace(/\.$/, '')}`;

    expect(metadata.title).toBe(expectedTitle);
    expect(String(metadata.description)).toContain(COMPANY_IDENTITY.definition);
    expect(isArtistOnlyCompanyDefinition(String(metadata.description))).toBe(
      false
    );
    expect(
      isArtistOnlyCompanyDefinition(String(metadata.openGraph?.description))
    ).toBe(false);

    const schema = JSON.parse(
      buildOrganizationSchema({
        legalName: 'Jovie Technology Inc.',
        description: COMPANY_IDENTITY.definition,
      })
    ) as { description: string; knowsAbout: string[] };

    expect(schema.description).toBe(COMPANY_IDENTITY.definition);
    expect(schema.knowsAbout).toEqual([...COMPANY_IDENTITY.knowsAbout]);
    expect(schema.knowsAbout).toContain('Independent Creators');
    expect(schema.knowsAbout).toContain('Music Marketing');
  });

  it('uses general root-layout and signup metadata defaults', async () => {
    const rootLayout = readWebSource('app/layout.tsx');
    const { metadata: signupMetadata } = await import(
      '../../../app/(auth)/signup/layout'
    );

    expect(rootLayout).toContain('COMPANY_IDENTITY.seoDescription');
    expect(isArtistOnlyCompanyDefinition(COMPANY_IDENTITY.seoDescription)).toBe(
      false
    );
    expect(signupMetadata.description).toBe(COMPANY_IDENTITY.signupDescription);
    expect(
      isArtistOnlyCompanyDefinition(String(signupMetadata.description))
    ).toBe(false);
    expect(
      requiresSpotifyCatalogOrFollowers(String(signupMetadata.description))
    ).toBe(false);
  });

  it('keeps machine-readable identity general while specialist artist APIs stay scoped', async () => {
    const llms = extractCompanyIdentityBlock(await getLlmsTxt().text());
    const llmsFull = extractCompanyIdentityBlock(await getLlmsFull().text());
    const webManifest = manifest();

    expect(isArtistOnlyCompanyDefinition(llms)).toBe(false);
    expect(isArtistOnlyCompanyDefinition(llmsFull)).toBe(false);
    expect(llms).toContain(COMPANY_IDENTITY.definition);
    expect(llmsFull).toContain(COMPANY_IDENTITY.definition);
    expect(webManifest.description).toBe(COMPANY_IDENTITY.seoDescription);
    expect(isArtistOnlyCompanyDefinition(String(webManifest.description))).toBe(
      false
    );
    expect(webManifest.shortcuts?.[0]?.name).toBe('Find yourself');

    const specialist = readWebSource(SPECIALIST_API_IDENTITY_SURFACES[0].path);
    expect(specialist).toContain('public artist API');
    expect(specialist).toContain('read-only');
    expect(isArtistOnlyCompanyDefinition(specialist)).toBe(false);
  });

  it('scans general identity sources and allows labeled artist pages to keep music terms', () => {
    for (const surface of GENERAL_IDENTITY_SURFACES) {
      const source = readWebSource(surface.path);
      const inspected =
        surface.id === 'llms-txt' || surface.id === 'llms-full'
          ? extractCompanyIdentityBlock(source)
          : source;
      expect(
        isArtistOnlyCompanyDefinition(inspected),
        `${surface.path} still defines Jovie as artist-only`
      ).toBe(false);
    }

    const labeled = readWebSource(ARTIST_LABELED_IDENTITY_SURFACES[0].path);
    expect(labeled.toLowerCase()).toMatch(/artist/);
  });

  it('renders generic auth defaults without an artist-only company headline', async () => {
    const { AuthBrandPanel, DEFAULT_AUTH_BRAND_HEADLINE } = await import(
      '@/components/features/auth/AuthBrandPanel'
    );

    expect(DEFAULT_AUTH_BRAND_HEADLINE).toBe(COMPANY_IDENTITY.homepageHeadline);
    expect(isArtistOnlyCompanyDefinition(DEFAULT_AUTH_BRAND_HEADLINE)).toBe(
      false
    );

    render(<AuthBrandPanel />);
    expect(
      screen.getByRole('heading', {
        name: COMPANY_IDENTITY.homepageHeadline,
      })
    ).toBeVisible();
    expect(screen.getByText(COMPANY_IDENTITY.seoDescription)).toBeVisible();
  });
});

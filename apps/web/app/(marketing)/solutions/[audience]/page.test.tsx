import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ArtistProfileLandingRoute } from '@/components/marketing/artist-profile/ArtistProfileLandingRoute';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import {
  getIndexedSolutionsPages,
  getSolutionsPage,
  SOLUTIONS_PAGE_RECORDS,
} from '@/content/pages/solutions';
import { solutionsArtistsPage } from '@/content/pages/solutions/artists';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  definePage,
  type PageRecord,
} from '@/data/marketing/factory/pageRecord';
import { getMarketingSection } from '@/data/marketing/sections';
import SolutionsAudiencePage, {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
  revalidate,
} from './page';
import {
  assertRenderableSolutionsRecord,
  SOLUTIONS_SECTION_RENDERERS,
  SolutionsRecordBody,
  SolutionsRecordJsonLd,
} from './sections';

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  })
);

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/solutions/artists',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock('next/image', () => ({
  default: (props: { readonly alt?: string; readonly src?: unknown }) => (
    <img
      alt={props.alt ?? ''}
      src={typeof props.src === 'string' ? props.src : ''}
    />
  ),
}));

const params = (audience: string) => ({
  params: Promise.resolve({ audience }),
});

describe('/solutions/[audience] family renderer (JOV-7275)', () => {
  it('is fully static over the routed records', () => {
    expect(revalidate).toBe(false);
    expect(dynamicParams).toBe(false);
    expect(generateStaticParams()).toEqual([{ audience: 'artists' }]);
  });

  it('renders the artists record with markup identical to the artist-lp route', () => {
    // Route snapshot + parity guard: the record composes the same section
    // owners /artist-profiles renders, so /solutions/artists stays
    // pixel-identical (verified at 390 and 1440 in the PR).
    expect(
      renderToStaticMarkup(
        <SolutionsRecordBody record={solutionsArtistsPage} />
      )
    ).toBe(renderToStaticMarkup(<ArtistProfileLandingRoute />));
  });

  it('emits SoftwareApplication JSON-LD from record.seo', async () => {
    const { container } = render(
      await SolutionsAudiencePage(params('artists'))
    );
    const script = container.querySelector(
      'script[type="application/ld+json"]'
    );
    const schema = JSON.parse(script?.textContent ?? '{}');
    expect(schema['@type']).toBe('SoftwareApplication');
    expect(schema.description).toBe(ARTIST_PROFILE_COPY.seo.description);
  });

  it('renders the record contract markers once, in music scope', async () => {
    const { container } = render(
      await SolutionsAudiencePage(params('artists'))
    );
    const markers = container.querySelectorAll('[data-copy-scope]');
    expect(markers).toHaveLength(1);
    expect(markers[0]).toHaveAttribute('data-copy-scope', 'music');
    expect(markers[0]).toHaveAttribute(
      'data-page-job',
      solutionsArtistsPage.brief.job
    );
  });

  it('emits FAQPage JSON-LD only when the record declares seo.faq', async () => {
    const withFaq = definePage({
      ...solutionsArtistsPage,
      seo: {
        ...solutionsArtistsPage.seo,
        faq: [{ question: 'Is it free?', answer: 'Yes, profiles are free.' }],
      },
    });
    const schemaTypes = (record: PageRecord) => {
      const { container } = render(<SolutionsRecordJsonLd record={record} />);
      return Array.from(
        container.querySelectorAll('script[type="application/ld+json"]')
      ).map(node => JSON.parse(node.textContent ?? '{}')['@type']);
    };

    expect(schemaTypes(solutionsArtistsPage)).toEqual(['SoftwareApplication']);
    expect(schemaTypes(withFaq)).toEqual(['SoftwareApplication', 'FAQPage']);
  });

  it('keeps the migrated canonical, Open Graph, and Twitter metadata', async () => {
    const metadata = await generateMetadata(params('artists'));
    const canonicalUrl = `${BASE_URL}${APP_ROUTES.SOLUTIONS_ARTISTS}`;
    const ogImage = `${BASE_URL}/og/default.png`;

    expect(metadata.title).toBe(ARTIST_PROFILE_COPY.seo.title);
    expect(metadata.description).toBe(ARTIST_PROFILE_COPY.seo.description);
    expect(metadata.keywords).toEqual(ARTIST_PROFILE_COPY.seo.keywords);
    expect(metadata.alternates?.canonical).toBe(canonicalUrl);
    expect(metadata.robots).toBeUndefined();
    expect(metadata.openGraph).toMatchObject({
      title: `For Artists | ${APP_NAME}`,
      url: canonicalUrl,
      siteName: APP_NAME,
      type: 'website',
      images: [
        {
          url: ogImage,
          secureUrl: ogImage,
          width: 1200,
          height: 630,
          alt: ARTIST_PROFILE_COPY.seo.title,
          type: 'image/png',
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: `For Artists | ${APP_NAME}`,
      images: [ogImage],
      creator: '@meetjovie',
      site: '@meetjovie',
    });
  });

  it('404s unknown slugs', async () => {
    await expect(
      SolutionsAudiencePage(params('dentists'))
    ).rejects.toThrowError('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
  });

  it('does not route shadow records and only indexes indexed ones', () => {
    const shadow = definePage({
      ...solutionsArtistsPage,
      id: 'solutions.founders',
      slug: 'founders',
      status: 'shadow',
    });
    const noindex = definePage({
      ...solutionsArtistsPage,
      id: 'solutions.investors',
      slug: 'investors',
      status: 'noindex',
    });
    const records = [solutionsArtistsPage, shadow, noindex];

    expect(getSolutionsPage('founders', records)).toBeNull();
    expect(getSolutionsPage('investors', records)).toBe(noindex);
    expect(getIndexedSolutionsPages(records)).toEqual([solutionsArtistsPage]);
  });

  it('composes only approved canonical sections from the closed renderer map', () => {
    for (const record of SOLUTIONS_PAGE_RECORDS) {
      expect(() => assertRenderableSolutionsRecord(record)).not.toThrow();
      for (const section of record.composition.sections) {
        expect(getMarketingSection(section.sectionId).status).toBe('approved');
      }
    }
    for (const renderer of Object.values(SOLUTIONS_SECTION_RENDERERS)) {
      expect(getMarketingSection(renderer.sectionId).status).toBe('approved');
    }
  });

  it('fails the build gate on unknown renderers, mismatched sections, or claims', () => {
    const withSections = (
      sections: typeof solutionsArtistsPage.composition.sections
    ) =>
      definePage({
        ...solutionsArtistsPage,
        composition: { ...solutionsArtistsPage.composition, sections },
      });

    expect(() =>
      assertRenderableSolutionsRecord(
        withSections([{ renderer: 'bespoke-hero', sectionId: 'hero' }])
      )
    ).toThrowError(/section bespoke-hero does not render hero/u);
    expect(() =>
      assertRenderableSolutionsRecord(
        withSections([
          { renderer: 'artist-hero-adaptive-intro', sectionId: 'hero' },
          { renderer: 'artist-faq', sectionId: 'cta' },
        ])
      )
    ).toThrowError(/section artist-faq does not render cta/u);
    expect(() =>
      assertRenderableSolutionsRecord(solutionsArtistsPage, [])
    ).toThrowError(/references unknown claims/u);
  });
});

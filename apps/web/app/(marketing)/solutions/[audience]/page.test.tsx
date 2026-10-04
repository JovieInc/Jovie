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
import {
  getMarketingSection,
  MARKETING_SECTION_IDS,
} from '@/data/marketing/sections';
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
  default: (props: {
    readonly alt?: string;
    readonly src?: unknown;
    readonly width?: number;
    readonly height?: number;
  }) => (
    <img
      alt={props.alt ?? ''}
      src={typeof props.src === 'string' ? props.src : ''}
      width={props.width}
      height={props.height}
    />
  ),
}));

const params = (audience: string) => ({
  params: Promise.resolve({ audience }),
});

function factoryRecord(copyOverrides: PageRecord['copy'] = {}) {
  return definePage({
    ...solutionsArtistsPage,
    id: 'solutions.founders',
    slug: 'founders',
    status: 'shadow',
    brief: {
      audience: 'founders building an owned audience',
      job: 'show founders how a public profile captures subscribers',
      successEvent: 'claim-profile',
      copyScope: 'shared',
    },
    composition: {
      ...solutionsArtistsPage.composition,
      shellClassName: undefined,
      sections: [
        {
          renderer: 'factory-hero',
          instanceId: 'hero-1',
          sectionId: 'hero',
        },
        {
          renderer: 'factory-feature-split',
          instanceId: 'capture-1',
          sectionId: 'feature-split',
        },
        {
          renderer: 'factory-cta',
          instanceId: 'cta-1',
          sectionId: 'cta',
        },
      ],
    },
    copy: {
      'hero-1.headline': { text: 'Claim your public profile' },
      'hero-1.subhead': {
        text: 'Turn visitors into subscribers you can reach again.',
      },
      'capture-1.body': {
        text: 'Visitors subscribe from your page and opt into updates.',
      },
      'cta-1.headline': { text: 'Start free today' },
      ...copyOverrides,
    },
    media: {
      'hero-1': {
        kind: 'public-path',
        id: '/og/default.png',
        alt: 'Public profile preview',
      },
      'capture-1': {
        kind: 'public-path',
        id: '/og/default.png',
        alt: 'Subscriber capture preview',
      },
    },
    proof: [],
    seo: {
      ...solutionsArtistsPage.seo,
      title: 'Public profiles for founders',
      socialTitle: 'Public profiles for founders',
      description: 'Claim a public profile and capture subscribers.',
      keywords: [],
    },
  });
}

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

  it('renders a factory-shaped record from instance-scoped copy and media', () => {
    const record = factoryRecord();

    expect(() => assertRenderableSolutionsRecord(record)).not.toThrow();
    const { container } = render(<SolutionsRecordBody record={record} />);
    expect(container).toHaveTextContent('Claim your public profile');
    expect(container).toHaveTextContent(
      'Turn visitors into subscribers you can reach again.'
    );
    expect(container).toHaveTextContent(
      'Visitors subscribe from your page and opt into updates.'
    );
    expect(container).toHaveTextContent('Start free today');
    expect(
      container.querySelector('[data-factory-media="/og/default.png"]')
    ).toBeInTheDocument();
  });

  it('fails the build gate when a factory section is missing a required copy slot', () => {
    const valid = factoryRecord();
    const { 'hero-1.headline': _missing, ...copyWithoutHeadline } = valid.copy;
    const record = definePage({ ...valid, copy: copyWithoutHeadline });

    expect(() => assertRenderableSolutionsRecord(record)).toThrowError(
      /missing copy slot hero-1\.headline/u
    );
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
    expect(schema.description).toBe(solutionsArtistsPage.seo.description);
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
    expect(markers[0]).toHaveAttribute(
      'data-success-event',
      solutionsArtistsPage.brief.successEvent
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

    expect(metadata.title).toBe(solutionsArtistsPage.seo.title);
    expect(metadata.description).toBe(solutionsArtistsPage.seo.description);
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
          alt: solutionsArtistsPage.seo.title,
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
    for (const sectionId of MARKETING_SECTION_IDS) {
      expect(SOLUTIONS_SECTION_RENDERERS[`factory-${sectionId}`]).toMatchObject(
        { sectionId }
      );
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

describe('generated media slot (JOV-7765)', () => {
  const digest = `sha256:${'b'.repeat(64)}`;

  function withHeroMedia(media: PageRecord['media'][string]) {
    const record = factoryRecord();
    return definePage({
      ...record,
      media: { ...record.media, 'hero-1': media },
    });
  }

  function heroFrame(container: HTMLElement) {
    const frame = container.querySelector<HTMLElement>(
      '[data-factory-media-digest]'
    );
    expect(frame).not.toBeNull();
    return frame as HTMLElement;
  }

  it('reserves the render aspect ratio and exposes its digest', () => {
    const { container } = render(
      <SolutionsRecordBody
        record={withHeroMedia({
          kind: 'generated',
          id: '/marketing/factory/hero.avif',
          alt: 'Generated hero',
          mime: 'image/avif',
          width: 1600,
          height: 900,
          digest,
        })}
      />
    );
    const frame = heroFrame(container);

    const image = frame.querySelector('img');

    expect(frame).toHaveAttribute('data-factory-media-digest', digest);
    expect(image).toHaveAttribute('alt', 'Generated hero');
    // Intrinsic size on the element is what reserves its box (CLS 0).
    expect(image).toHaveAttribute('width', '1600');
    expect(image).toHaveAttribute('height', '900');
    expect(frame.querySelector('video')).toBeNull();
  });

  it('renders captioned video click-to-play behind its poster, never autoplaying', () => {
    const { container } = render(
      <SolutionsRecordBody
        record={withHeroMedia({
          kind: 'generated',
          id: '/marketing/factory/hero.mp4',
          alt: 'Generated walkthrough',
          mime: 'video/mp4',
          width: 1280,
          height: 720,
          digest,
          poster: '/marketing/factory/hero-poster.avif',
          captions: '/marketing/factory/hero.vtt',
        })}
      />
    );
    const video = heroFrame(container).querySelector('video');

    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('width', '1280');
    expect(video).toHaveAttribute('height', '720');
    expect(video).toHaveAttribute(
      'poster',
      '/marketing/factory/hero-poster.avif'
    );
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('preload', 'none');
    expect(video).not.toHaveAttribute('autoplay');
    expect(video).not.toHaveAttribute('loop');
    expect(video?.querySelector('track')).toHaveAttribute(
      'src',
      '/marketing/factory/hero.vtt'
    );
    expect(video?.querySelector('source')).toHaveAttribute('type', 'video/mp4');
  });

  it('puts a re-render on the page as a new artifact', () => {
    const markup = (hash: string) =>
      renderToStaticMarkup(
        <SolutionsRecordBody
          record={withHeroMedia({
            kind: 'generated',
            id: '/marketing/factory/hero.avif',
            alt: 'Generated hero',
            mime: 'image/avif',
            width: 1600,
            height: 900,
            digest: hash,
          })}
        />
      );

    expect(markup(digest)).not.toBe(markup(`sha256:${'c'.repeat(64)}`));
  });
});

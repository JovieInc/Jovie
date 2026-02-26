import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { AuthRedirectHandler } from '@/components/home/AuthRedirectHandler';
import { AutomaticReleaseSmartlinksSection } from '@/components/home/AutomaticReleaseSmartlinksSection';

const ComparisonSection = dynamic(
  () =>
    import('@/components/home/comparison-visual').then(m => ({
      default: m.ComparisonSection,
    })),
  { loading: () => <div style={{ height: 480 }} /> }
);
const ExampleProfilesCarousel = dynamic(
  () =>
    import('@/components/home/ExampleProfilesCarousel').then(m => ({
      default: m.ExampleProfilesCarousel,
    })),
  { loading: () => <div style={{ height: 400 }} /> }
);
const DeeplinksGrid = dynamic(
  () =>
    import('@/components/home/DeeplinksGrid').then(m => ({
      default: m.DeeplinksGrid,
    })),
  { loading: () => <div style={{ height: 480 }} /> }
);

import { DashboardShowcase } from '@/components/home/DashboardShowcase';
import { FeatureBlocks } from '@/components/home/FeatureBlocks';
import { FinalCTASection } from '@/components/home/FinalCTASection';
import { FALLBACK_AVATARS } from '@/components/home/featured-creators-fallback';
import { HowItWorksRich } from '@/components/home/HowItWorksRich';
import { LabelLogosBar } from '@/components/home/LabelLogosBar';
import { ProductShowcase } from '@/components/home/ProductShowcase';
import { RedesignedHero } from '@/components/home/RedesignedHero';
import { SeeItInActionCarousel } from '@/components/home/SeeItInActionCarousel';
import { DeferredSection } from '@/components/organisms/DeferredSection';
import { APP_NAME, APP_URL } from '@/constants/app';
import { publicEnv } from '@/lib/env-public';
import { homepageFlagDefaults } from '@/lib/flags/homepage';

// Static rendering: use hardcoded flag defaults instead of evaluating flag()
// functions which call cookies()/headers() and force dynamic rendering.
export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} — The Link-in-Bio Built for Artists`;
  const description =
    'Capture fan contacts, guide listeners to the right music destination, and grow your owned audience with a conversion-first artist profile.';
  const keywords = [
    'link in bio',
    'linktree alternative',
    'artist link in bio',
    'music link in bio',
    'creator profile',
    'music artist',
    'spotify link',
    'apple music link',
    'youtube music link',
    'social media links',
    'music promotion',
    'artist profile',
    'music marketing',
    'streaming links',
    'music links',
    'artist bio',
    'music discovery',
    'fan engagement',
    'email subscribers',
    'sms marketing',
    'fan conversion',
    'smart links',
    'pre-save links',
  ];

  return {
    title,
    description,
    keywords,
    authors: [
      {
        name: APP_NAME,
        url: APP_URL,
      },
    ],
    creator: APP_NAME,
    publisher: APP_NAME,
    category: 'Music',
    classification: 'Business',
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    metadataBase: new URL(APP_URL),
    alternates: {
      canonical: '/',
      languages: {
        'en-US': '/',
      },
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: APP_URL,
      title,
      description,
      siteName: APP_NAME,
      images: [
        {
          url: `${APP_URL}/og/default.png`,
          secureUrl: `${APP_URL}/og/default.png`,
          width: 1200,
          height: 630,
          alt: `${APP_NAME} - The Link-in-Bio Built for Artists`,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [
        {
          url: `${APP_URL}/og/default.png`,
          alt: `${APP_NAME} - The Link-in-Bio Built for Artists`,
          width: 1200,
          height: 630,
        },
      ],
      creator: '@jovie',
      site: '@jovie',
    },
    robots: {
      index: true,
      follow: true,
      nocache: false,
      googleBot: {
        index: true,
        follow: true,
        noimageindex: false,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    verification: {
      google: publicEnv.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    },
    other: {
      'msvalidate.01': publicEnv.NEXT_PUBLIC_BING_SITE_VERIFICATION ?? '',
      'yandex-verification':
        publicEnv.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION ?? '',
      'p:domain_verify': publicEnv.NEXT_PUBLIC_PINTEREST_VERIFICATION ?? '',
    },
  };
}

// Helper to safely serialize JSON-LD with XSS protection
const jsonLd = (value: unknown) =>
  JSON.stringify(value).replaceAll('<', String.raw`\u003c`);

// Pre-serialized JSON-LD structured data for static generation
const WEBSITE_SCHEMA = jsonLd({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: APP_NAME,
  alternateName: 'Jovie Link in Bio',
  description:
    'Capture fan contacts and direct every visitor to the right listening destination with one focused profile.',
  url: APP_URL,
  inLanguage: 'en-US',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${APP_URL}/search?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
  publisher: {
    '@type': 'Organization',
    name: APP_NAME,
    url: APP_URL,
    logo: {
      '@type': 'ImageObject',
      url: `${APP_URL}/brand/Jovie-Logo-Icon.svg`,
      width: 512,
      height: 512,
    },
  },
});

const SOFTWARE_SCHEMA = jsonLd({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: APP_NAME,
  description:
    'A conversion-first link-in-bio platform for artists to capture fan contacts and drive clear next actions.',
  url: APP_URL,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Free to start',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '5',
    ratingCount: '1',
    bestRating: '5',
    worstRating: '1',
  },
  author: {
    '@type': 'Organization',
    name: APP_NAME,
    url: APP_URL,
  },
});

const ORGANIZATION_SCHEMA = jsonLd({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: APP_NAME,
  legalName: 'Jovie Inc',
  url: APP_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${APP_URL}/brand/Jovie-Logo-Icon.svg`,
    width: 512,
    height: 512,
  },
  image: `${APP_URL}/og/default.png`,
  description:
    'A conversion-first link-in-bio platform for artists to capture fan contacts and drive clear next actions.',
  sameAs: ['https://twitter.com/jovie', 'https://instagram.com/jovie'],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    url: `${APP_URL}/support`,
  },
});

export default function HomePage() {
  const d = homepageFlagDefaults;
  const showHero = d.homepage_hero;
  const showLabelLogos = d.homepage_label_logos;
  const showHowItWorks = d.homepage_how_it_works;
  const showDashboardShowcase = d.homepage_dashboard_showcase;
  const showProductPreview = d.homepage_product_preview;
  const showExampleProfiles = d.homepage_example_profiles;
  const showDeeplinksGrid = d.homepage_deeplinks_grid;
  const showComparison = d.homepage_comparison;
  const showSeeItInAction = d.homepage_see_it_in_action;
  const showFinalCta = d.homepage_final_cta;
  const showAutomaticReleaseSmartlinks =
    d.homepage_automatic_release_smartlinks;
  const showFeatureBlocks = d.homepage_feature_blocks;

  return (
    <div
      className='relative min-h-screen'
      style={{
        backgroundColor: 'var(--linear-bg-footer)',
        color: 'var(--linear-text-primary)',
      }}
    >
      {/* Non-blocking: redirects signed-in users to dashboard after hydration */}
      <AuthRedirectHandler />

      {/* Structured Data */}
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD schema
        dangerouslySetInnerHTML={{ __html: WEBSITE_SCHEMA }}
      />
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD schema
        dangerouslySetInnerHTML={{ __html: SOFTWARE_SCHEMA }}
      />
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD schema
        dangerouslySetInnerHTML={{ __html: ORGANIZATION_SCHEMA }}
      />

      {/* Hero + logo bar fill the viewport together (minus fixed header) */}
      <div
        className='flex flex-col'
        style={{ minHeight: 'calc(100svh - var(--linear-header-height))' }}
      >
        {showHero && <RedesignedHero />}
      </div>

      {showHowItWorks && <HowItWorksRich />}

      {showAutomaticReleaseSmartlinks && (
        <DeferredSection placeholderHeight={560}>
          <AutomaticReleaseSmartlinksSection />
        </DeferredSection>
      )}

      {showDashboardShowcase && (
        <DeferredSection placeholderHeight={640}>
          <DashboardShowcase />
        </DeferredSection>
      )}

      {showLabelLogos && <LabelLogosBar />}

      {showFeatureBlocks && (
        <DeferredSection placeholderHeight={1200}>
          <FeatureBlocks />
        </DeferredSection>
      )}

      {showProductPreview && (
        <DeferredSection placeholderHeight={640}>
          <ProductShowcase />
        </DeferredSection>
      )}

      {showExampleProfiles && (
        <DeferredSection placeholderHeight={400}>
          <ExampleProfilesCarousel />
        </DeferredSection>
      )}

      {showDeeplinksGrid && (
        <DeferredSection placeholderHeight={480}>
          <DeeplinksGrid />
        </DeferredSection>
      )}

      {showComparison && (
        <DeferredSection placeholderHeight={480}>
          <ComparisonSection />
        </DeferredSection>
      )}

      {showSeeItInAction && (
        <DeferredSection placeholderHeight={520}>
          <SeeItInActionCarousel creators={FALLBACK_AVATARS} />
        </DeferredSection>
      )}

      {showFinalCta && (
        <DeferredSection placeholderHeight={480}>
          <FinalCTASection />
        </DeferredSection>
      )}
    </div>
  );
}

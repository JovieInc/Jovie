import type { Metadata } from 'next';
import { APP_NAME, APP_URL } from '@/constants/app';
import { AiSection } from './_components/AiSection';
import { AudienceSection } from './_components/AudienceSection';
import { ComparisonSection } from './_components/ComparisonSection';
import { CtaSection } from './_components/CtaSection';
import { DeeplinksSection } from './_components/DeeplinksSection';
import { FlywheelSection } from './_components/FlywheelSection';
import { HeroSection } from './_components/HeroSection';
import { ProfilesSection } from './_components/ProfilesSection';
import { SmartLinksSection } from './_components/SmartLinksSection';
import { ThesisSection } from './_components/ThesisSection';
import { WhyNowSection } from './_components/WhyNowSection';

// Fully static - no database dependency, instant cold starts
export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} — Your Entire Music Career. One Intelligent Link.`;
  const description =
    'Paste your Spotify. Jovie imports your discography, creates smart links for every release, and builds a link-in-bio that turns listeners into fans you actually own.';
  const keywords = [
    'link in bio',
    'linktree alternative',
    'artist link in bio',
    'music link in bio',
    'smart links',
    'music smart links',
    'spotify link in bio',
    'apple music link',
    'youtube music link',
    'music promotion',
    'artist profile',
    'music marketing',
    'streaming links',
    'fan engagement',
    'email subscribers',
    'sms marketing',
    'fan conversion',
    'pre-save links',
    'ai music tools',
    'music career',
    'indie artist tools',
  ];

  return {
    title,
    description,
    keywords,
    authors: [{ name: APP_NAME, url: APP_URL }],
    creator: APP_NAME,
    publisher: APP_NAME,
    category: 'Music',
    classification: 'Business',
    formatDetection: { email: false, address: false, telephone: false },
    metadataBase: new URL(APP_URL),
    alternates: {
      canonical: '/launch',
      languages: { 'en-US': '/launch' },
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: `${APP_URL}/launch`,
      title,
      description,
      siteName: APP_NAME,
      images: [
        {
          url: `${APP_URL}/og/default.png`,
          secureUrl: `${APP_URL}/og/default.png`,
          width: 1200,
          height: 630,
          alt: `${APP_NAME} - Your Entire Music Career. One Intelligent Link.`,
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
          alt: `${APP_NAME} - Your Entire Music Career. One Intelligent Link.`,
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
      google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    },
    other: {
      'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION || '',
      'yandex-verification':
        process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION || '',
      'p:domain_verify': process.env.NEXT_PUBLIC_PINTEREST_VERIFICATION || '',
    },
  };
}

// Helper to safely serialize JSON-LD with XSS protection
const jsonLd = (value: unknown) =>
  JSON.stringify(value).replaceAll('<', String.raw`\u003c`);

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
    'An AI-powered operating system for indie artists — smart links, link-in-bio, fan capture, and AI assistant in one platform.',
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
    'An AI-powered operating system for indie artists — smart links, link-in-bio, fan capture, and AI assistant in one platform.',
  sameAs: ['https://twitter.com/jovie', 'https://instagram.com/jovie'],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    url: `${APP_URL}/support`,
  },
});

export default function LaunchPage() {
  return (
    <div className='relative min-h-screen'>
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

      <HeroSection />
      <ThesisSection />
      <ProfilesSection />
      <SmartLinksSection />
      <DeeplinksSection />
      <AiSection />
      <AudienceSection />
      <WhyNowSection />
      <FlywheelSection />
      <ComparisonSection />
      <CtaSection />
    </div>
  );
}

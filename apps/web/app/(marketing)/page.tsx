import type { Metadata } from 'next';
import { FaqSection, NumberedSection } from '@/components/marketing';
import { APP_NAME, APP_URL } from '@/constants/app';
import { AiDemo } from '@/features/home/AiDemo';
import { AudienceCRMSection } from '@/features/home/AudienceCRMSection';
import { AuthRedirectHandler } from '@/features/home/AuthRedirectHandler';
import { FinalCTASection } from '@/features/home/FinalCTASection';
import { HeroScrollSection } from '@/features/home/HeroScrollSection';
import { LogoBar } from '@/features/home/LogoBar';
import { PhoneProfileDemo } from '@/features/home/PhoneProfileDemo';
import { PricingSection } from '@/features/home/PricingSection';
import { ReleasesSection } from '@/features/home/ReleasesSection';
import { TestimonialsSection } from '@/features/home/TestimonialsSection';
import { ValuePropsSection } from '@/features/home/ValuePropsSection';
import {
  buildFaqSchema,
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';
import { publicEnv } from '@/lib/env-public';

// Marketing pages must remain fully static.
export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} | Release More Music.`;
  const description =
    'Release more music. Do less release work. Jovie gives independent artists smart links, artist profiles, audience intelligence, and release automation built for every drop.';
  const keywords = [
    'smart link in bio',
    'link in bio for musicians',
    'linktree alternative for artists',
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
          alt: `${APP_NAME} - Release More Music.`,
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
          alt: `${APP_NAME} - Release More Music.`,
          width: 1200,
          height: 630,
        },
      ],
      creator: '@jovieapp',
      site: '@jovieapp',
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

// Pre-serialized JSON-LD structured data for static generation
const WEBSITE_SCHEMA = buildWebsiteSchema({
  alternateName: ['Jovie', 'jov.ie', 'Jovie Link in Bio'],
  description:
    'Release more music. Do less release work. Jovie gives independent artists smart links, artist profiles, audience intelligence, and release automation built for every drop.',
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(
  'Release more music with smart links, audience intelligence, paid release notifications, and AI support built for independent musicians.'
);

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: 'Jovie Technology Inc.',
  description:
    'Jovie is the release platform for independent musicians, combining smart links, artist profiles, audience insights, paid release notifications, and AI support.',
  sameAs: ['https://instagram.com/meetjovie'],
});

const HOME_FAQ_ITEMS = [
  {
    question: 'What is Jovie?',
    answer:
      'Jovie is a release platform for independent musicians. It gives you smart links, an artist profile, audience intelligence, release automation, and AI tools — all in one place. Create your profile free at jov.ie.',
  },
  {
    question: 'Is Jovie free?',
    answer:
      'Yes. Jovie has a free tier that lets you create a profile, add releases, and start collecting fans. Paid plans unlock advanced analytics, branding removal, contact export, and more.',
  },
  {
    question: 'How do smart links work?',
    answer:
      'When you add a release to Jovie, it automatically generates a smart link. When a fan clicks it, Jovie detects which streaming platform they prefer (Spotify, Apple Music, YouTube, etc.) and routes them there. One link, every platform.',
  },
  {
    question: 'How is Jovie different from Linktree?',
    answer:
      'Linktree is a general-purpose link-in-bio tool. Jovie is built specifically for musicians — it auto-generates smart links for releases, routes fans to the right streaming platform, collects and manages fan contacts, sends automatic notifications when you drop new music, and includes AI tools that understand your career data.',
  },
  {
    question: 'Can I notify fans when I release music?',
    answer:
      'Yes. Jovie automatically notifies your fans via email when you release new music. Fans opt in through your profile page — you build your audience, and Jovie handles the delivery.',
  },
];

const HOME_FAQ_SCHEMA = buildFaqSchema(HOME_FAQ_ITEMS);

const AI_SUB_ITEMS = [
  {
    number: '4.1',
    title: 'Press Releases',
    description:
      'A press release that says you dropped "Never Say A Word" with The Orchard on March 3rd, it hit 42K streams in the first week, and you\'ve toured 12 cities this year. ChatGPT can\'t write that.',
  },
  {
    number: '4.2',
    title: 'Career Context',
    description:
      "Every release date, every stream count, every collab, every city you've played. The AI has your full history loaded — not a blank prompt.",
  },
  {
    number: '4.3',
    title: 'Release Strategy',
    description:
      'Rollout plans built on your actual numbers — which platforms drive your streams, when your fans are most active, what worked last time.',
  },
];

function AiSection() {
  return (
    <NumberedSection
      id='ai'
      sectionNumber='4.0'
      sectionTitle='AI'
      heading='AI that knows every song.'
      description='Your releases, your stream counts, your tour history, your collabs — all loaded. Ask it to write a press release and it cites real numbers. Ask it to plan a rollout and it pulls from what actually worked.'
      subItems={AI_SUB_ITEMS}
      className='relative overflow-hidden bg-page'
    >
      <div
        className='homepage-surface-card overflow-hidden rounded-[1rem]'
        style={{
          boxShadow:
            '0 0 0 1px rgba(255,255,255,0.04), 0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <AiDemo />
      </div>
    </NumberedSection>
  );
}

export default function HomePage() {
  return (
    <div className='relative min-h-screen'>
      {/* Non-blocking: redirects signed-in users to dashboard after hydration */}
      <AuthRedirectHandler />

      {/* Structured Data */}
      <script type='application/ld+json'>{WEBSITE_SCHEMA}</script>
      <script type='application/ld+json'>{SOFTWARE_SCHEMA}</script>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>
      <script type='application/ld+json'>{HOME_FAQ_SCHEMA}</script>

      {/* 1. Hero */}
      <HeroScrollSection />

      {/* Logo trust bar */}
      <LogoBar />

      {/* Value proposition — FIG cards */}
      <ValuePropsSection />

      {/* 1.0 Release */}
      <ReleasesSection />

      {/* 2.0 Profile */}
      <PhoneProfileDemo />

      {/* 3.0 Audience */}
      <AudienceCRMSection />

      {/* 4.0 AI */}
      <AiSection />

      {/* Pricing — must show before CTA for conversion */}
      <PricingSection />

      {/* Testimonials */}
      <TestimonialsSection />

      {/* FAQ */}
      <FaqSection
        items={HOME_FAQ_ITEMS}
        className='mx-auto max-w-[720px] px-6 py-20 sm:px-8 lg:px-10'
        headingClassName='text-center text-3xl font-semibold tracking-tight text-primary-token'
      />

      {/* Final CTA */}
      <FinalCTASection />
    </div>
  );
}

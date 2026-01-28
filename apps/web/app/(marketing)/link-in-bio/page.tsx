import type { Metadata } from 'next';
import { BenefitsGrid } from '@/components/link-in-bio/BenefitsGrid';
import { ComparisonSection } from '@/components/link-in-bio/ComparisonSection';
import { LinkInBioCTA } from '@/components/link-in-bio/LinkInBioCTA';
import { LinkInBioHero } from '@/components/link-in-bio/LinkInBioHero';
import { APP_NAME, APP_URL } from '@/constants/app';

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} - Built to Convert, Not to Decorate`;
  const description =
    'Highest converting profiles for music artists. Analytics you can trust, lightning-fast loading, always beautiful design. Turn fans into streams instantly.';
  const keywords = [
    'artist profile',
    'music artist conversion',
    'streaming optimization',
    'artist analytics',
    'music marketing',
    'fan engagement',
    'profile optimization',
    'social media links',
    'music discovery',
    'artist tools',
    'streaming analytics',
    'music promotion',
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
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    metadataBase: new URL(APP_URL),
    alternates: {
      canonical: `${APP_URL}/link-in-bio`,
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${APP_URL}/link-in-bio`,
      siteName: APP_NAME,
      images: [
        {
          url: `${APP_URL}/og-image.png`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${APP_URL}/og-image.png`],
    },
  };
}

export default function LinkInBioPage() {
  return (
    <>
      {/* Structured Data */}
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD schema
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: `${APP_NAME} - Artist Profiles for Musicians`,
            description: 'Built to Convert, Not to Decorate',
            url: `${APP_URL}/link-in-bio`,
            publisher: {
              '@type': 'Organization',
              name: APP_NAME,
              url: APP_URL,
              logo: {
                '@type': 'ImageObject',
                url: `${APP_URL}/brand/Jovie-Logo-Icon.svg`,
              },
            },
            mainEntity: {
              '@type': 'SoftwareApplication',
              name: APP_NAME,
              applicationCategory: 'MusicApplication',
              operatingSystem: 'Web',
              description:
                'Artist profile platform optimized for music artists',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
            },
          }),
        }}
      />

      {/* Linear-inspired design with theme support */}
      <div className='relative min-h-screen bg-white text-gray-900 dark:bg-[#0D0E12] dark:text-white'>
        {/* Subtle grid background pattern */}
        <div className='absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-size-[50px_50px]' />

        {/* Gradient orbs - more subtle like Linear */}
        <div className='absolute top-0 left-1/4 w-96 h-96 bg-linear-to-r from-purple-500/10 to-blue-500/10 rounded-full blur-3xl' />
        <div className='absolute bottom-0 right-1/4 w-96 h-96 bg-linear-to-r from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl' />

        {/* Hero Section */}
        <LinkInBioHero />

        {/* Content sections with Linear-style spacing */}
        <div className='relative z-10'>
          {/* Benefits Grid */}
          <section className='py-24 border-t border-gray-200 dark:border-white/5'>
            <BenefitsGrid />
          </section>

          {/* Comparison Section */}
          <section className='py-24 border-t border-gray-200 dark:border-white/5'>
            <ComparisonSection />
          </section>
        </div>

        {/* CTA section */}
        <LinkInBioCTA />
      </div>
    </>
  );
}

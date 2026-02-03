import type { Metadata } from 'next';
import { BenefitsGrid } from '@/components/link-in-bio/BenefitsGrid';
import { ComparisonSection } from '@/components/link-in-bio/ComparisonSection';
import { LinkInBioCTA } from '@/components/link-in-bio/LinkInBioCTA';
import { APP_NAME, APP_URL, BRAND } from '@/constants/app';
import { ProfilesHero } from './ProfilesHero';

export async function generateMetadata(): Promise<Metadata> {
  const title = `${BRAND.product.name} — ${BRAND.product.tagline}`;
  const description =
    'One link that captures fans, routes them to their preferred platform, and updates itself with every release. Built to convert, not to decorate.';
  const keywords = [
    'jovie profiles',
    'artist profile',
    'link in bio for musicians',
    'music link in bio',
    'artist link in bio',
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
      canonical: `${APP_URL}/profiles`,
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${APP_URL}/profiles`,
      siteName: APP_NAME,
      images: [
        {
          url: `${APP_URL}/og/default.png`,
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
      images: [`${APP_URL}/og/default.png`],
    },
  };
}

export default function ProfilesPage() {
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
            name: `${BRAND.product.name} — ${BRAND.product.tagline}`,
            description:
              'One link that captures fans, routes them to their preferred platform, and updates itself.',
            url: `${APP_URL}/profiles`,
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
              name: BRAND.product.name,
              applicationCategory: 'MusicApplication',
              operatingSystem: 'Web',
              description:
                'AI-powered artist profiles that capture fans and optimize conversions automatically.',
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
      <div className='relative min-h-screen bg-base text-primary-token'>
        {/* Hero Section */}
        <ProfilesHero />

        {/* Content sections */}
        <div className='relative z-10'>
          {/* Benefits Grid */}
          <section className='py-24 border-t border-subtle'>
            <BenefitsGrid />
          </section>

          {/* Comparison Section */}
          <section className='py-24 border-t border-subtle'>
            <ComparisonSection />
          </section>
        </div>

        {/* CTA section */}
        <LinkInBioCTA />
      </div>
    </>
  );
}

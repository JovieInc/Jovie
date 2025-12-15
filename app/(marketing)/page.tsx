import type { Metadata } from 'next';
import Link from 'next/link';
import { NewHomeHero } from '@/components/home/NewHomeHero';
import { NewPreFooterCTA } from '@/components/home/NewPreFooterCTA';
import { Container } from '@/components/site/Container';
import { APP_NAME, APP_URL } from '@/constants/app';

// Root layout handles dynamic rendering
export const revalidate = 3600; // Revalidate every hour

export async function generateMetadata(): Promise<Metadata> {
  const title = `${APP_NAME} - Claim your @handle`;
  const description =
    "Secure your name. Share a profile that's fast, beautiful, and optimized to convert.";
  const keywords = [
    'creator profile',
    'music artist',
    'spotify',
    'social media',
    'music promotion',
    'artist profile',
    'music marketing',
    'streaming',
    'music links',
    'artist bio',
    'music discovery',
    'fan engagement',
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
      canonical: APP_URL,
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
          url: '/og/default.png',
          width: 1200,
          height: 630,
          alt: `${APP_NAME} - Claim your @handle`,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og/default.png'],
      creator: '@jovie',
      site: '@jovie',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    },
    other: {
      'music:musician': APP_URL,
      'music:album': APP_URL,
    },
  };
}

export default function HomePage() {
  return (
    <>
      {/* Structured Data */}
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: APP_NAME,
            description: 'Claim your @handle',
            url: APP_URL,
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: `${APP_URL}/?q={search_term_string}`,
              },
              'query-input': 'required name=search_term_string',
            },
            publisher: {
              '@type': 'Organization',
              name: APP_NAME,
              url: APP_URL,
              logo: {
                '@type': 'ImageObject',
                url: `${APP_URL}/brand/jovie-logo.svg`,
              },
            },
            sameAs: [
              'https://twitter.com/jovie',
              'https://instagram.com/jovie',
            ],
          }),
        }}
      />

      {/* Main content */}
      <div className='relative min-h-screen bg-base text-primary-token'>
        {/* 1. Hero Section (above the fold) */}
        <NewHomeHero />

        <section className='py-16 sm:py-20 bg-base'>
          <Container>
            <div className='mx-auto max-w-3xl space-y-16'>
              <section aria-labelledby='problem'>
                <h2
                  id='problem'
                  className='text-xl sm:text-2xl font-semibold tracking-tight text-primary-token'
                >
                  The problem
                </h2>
                <div className='mt-4 space-y-3 text-sm sm:text-base text-secondary-token leading-relaxed'>
                  <p>Creators send fans to a static link page.</p>
                  <p>Everyone sees the same buttons. Most people bounce.</p>
                  <p>
                    Email/SMS capture is low, merch/tickets are sporadic, and
                    it’s hard to know what worked.
                  </p>
                </div>
              </section>

              <section aria-labelledby='solution'>
                <h2
                  id='solution'
                  className='text-xl sm:text-2xl font-semibold tracking-tight text-primary-token'
                >
                  The solution
                </h2>
                <div className='mt-4 space-y-4 text-sm sm:text-base text-secondary-token leading-relaxed'>
                  <p>
                    <span className='font-semibold text-primary-token'>
                      Jovie turns your bio link into a personalized funnel.
                    </span>
                  </p>
                  <p>For every profile visit, Jovie:</p>
                  <ol className='list-decimal pl-5 space-y-2'>
                    <li>
                      <span className='font-semibold text-primary-token'>
                        Identifies
                      </span>{' '}
                      the fan (known, captured, or anonymous)
                    </li>
                    <li>
                      <span className='font-semibold text-primary-token'>
                        Chooses
                      </span>{' '}
                      the next best action (subscribe, listen, merch, tickets)
                    </li>
                    <li>
                      <span className='font-semibold text-primary-token'>
                        Measures
                      </span>{' '}
                      clicks + downstream value
                    </li>
                    <li>
                      <span className='font-semibold text-primary-token'>
                        Learns
                      </span>{' '}
                      which offers convert for which fans
                    </li>
                  </ol>
                  <p>
                    Result:{' '}
                    <span className='font-semibold text-primary-token'>
                      more captured fans + higher conversion from the traffic
                      you already have.
                    </span>
                  </p>
                </div>
              </section>

              <section id='how-it-works' aria-labelledby='how-it-works-heading'>
                <h2
                  id='how-it-works-heading'
                  className='text-xl sm:text-2xl font-semibold tracking-tight text-primary-token'
                >
                  How it works
                </h2>
                <div className='mt-6 space-y-8'>
                  <div>
                    <h3 className='text-base sm:text-lg font-semibold text-primary-token'>
                      1) Personalized CTAs (not one-size-fits-all)
                    </h3>
                    <div className='mt-3 space-y-2 text-sm sm:text-base text-secondary-token leading-relaxed'>
                      <p>
                        If a fan isn’t identified →{' '}
                        <span className='font-semibold text-primary-token'>
                          Primary CTA: Subscribe
                        </span>{' '}
                        (email/SMS)
                      </p>
                      <p>
                        If a fan is identified →{' '}
                        <span className='font-semibold text-primary-token'>
                          Primary CTA: Listen
                        </span>{' '}
                        (plus merch/tour/updates based on context)
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className='text-base sm:text-lg font-semibold text-primary-token'>
                      2) Smart routing
                    </h3>
                    <p className='mt-3 text-sm sm:text-base text-secondary-token leading-relaxed'>
                      Jovie remembers the fan’s preferred listening platform
                      (e.g. Spotify-first) and routes them automatically.
                    </p>
                  </div>

                  <div>
                    <h3 className='text-base sm:text-lg font-semibold text-primary-token'>
                      3) Automatic follow-ups
                    </h3>
                    <p className='mt-3 text-sm sm:text-base text-secondary-token leading-relaxed'>
                      Example automation:{' '}
                      <span className='font-semibold text-primary-token'>
                        Spotify click → 7-minute delayed playlist message
                      </span>{' '}
                      (email/SMS) to turn one stream into many.
                    </p>
                  </div>

                  <div>
                    <h3 className='text-base sm:text-lg font-semibold text-primary-token'>
                      4) Tracking that matters
                    </h3>
                    <p className='mt-3 text-sm sm:text-base text-secondary-token leading-relaxed'>
                      See:{' '}
                      <span className='font-semibold text-primary-token'>
                        profile views
                      </span>{' '}
                      →{' '}
                      <span className='font-semibold text-primary-token'>
                        captures
                      </span>{' '}
                      →{' '}
                      <span className='font-semibold text-primary-token'>
                        activation
                      </span>{' '}
                      →{' '}
                      <span className='font-semibold text-primary-token'>
                        value events
                      </span>
                      <span className='text-tertiary-token'>
                        {' '}
                        (streams, saves, merch/ticket intent)
                      </span>
                    </p>
                  </div>
                </div>
              </section>

              <section aria-labelledby='mvp'>
                <h2
                  id='mvp'
                  className='text-xl sm:text-2xl font-semibold tracking-tight text-primary-token'
                >
                  What you get (MVP)
                </h2>
                <ul className='mt-4 list-disc pl-5 space-y-2 text-sm sm:text-base text-secondary-token leading-relaxed'>
                  <li>
                    AI decisioning on your profile (primary + secondary CTAs)
                  </li>
                  <li>Email/SMS capture + segmentation</li>
                  <li>Platform preference memory + smart routing</li>
                  <li>Event tracking + dashboards (capture + activation)</li>
                  <li>Starter automations (playlist follow-up)</li>
                  <li>Fast onboarding (swap bio link + add pixel)</li>
                </ul>
              </section>

              <section aria-labelledby='who-its-for'>
                <h2
                  id='who-its-for'
                  className='text-xl sm:text-2xl font-semibold tracking-tight text-primary-token'
                >
                  Who it’s for
                </h2>
                <ul className='mt-4 list-disc pl-5 space-y-2 text-sm sm:text-base text-secondary-token leading-relaxed'>
                  <li>Indie artists with consistent social traffic</li>
                  <li>Managers running rosters</li>
                  <li>Labels/teams who want measurable lift in 2–4 weeks</li>
                </ul>
                <p className='mt-4 text-sm sm:text-base text-secondary-token leading-relaxed'>
                  If you can drive traffic, Jovie helps you{' '}
                  <span className='font-semibold text-primary-token'>
                    convert it
                  </span>
                  .
                </p>
              </section>

              <section aria-labelledby='why-now'>
                <h2
                  id='why-now'
                  className='text-xl sm:text-2xl font-semibold tracking-tight text-primary-token'
                >
                  Why now
                </h2>
                <div className='mt-4 space-y-3 text-sm sm:text-base text-secondary-token leading-relaxed'>
                  <p>Music creation is easy. Attention is scarce.</p>
                  <p>
                    The number of tracks uploaded every day keeps rising, and
                    static link pages aren’t built for conversion.
                  </p>
                  <p>
                    Jovie sits at the universal choke point:{' '}
                    <span className='font-semibold text-primary-token'>
                      your bio link
                    </span>
                    . It turns every visit into a compounding system:{' '}
                    <span className='font-semibold text-primary-token'>
                      traffic → identity → revenue
                    </span>
                    .
                  </p>
                </div>
              </section>

              <section aria-labelledby='traction'>
                <h2
                  id='traction'
                  className='text-xl sm:text-2xl font-semibold tracking-tight text-primary-token'
                >
                  Traction
                </h2>
                <ul className='mt-4 list-disc pl-5 space-y-2 text-sm sm:text-base text-secondary-token leading-relaxed'>
                  <li>
                    <span className='font-semibold text-primary-token'>
                      Stage:
                    </span>{' '}
                    MVP built, incorporated
                  </li>
                  <li>
                    <span className='font-semibold text-primary-token'>
                      Funding:
                    </span>{' '}
                    $25K angel committed
                  </li>
                  <li>
                    <span className='font-semibold text-primary-token'>
                      Next:
                    </span>{' '}
                    pilot cohort to publish baseline → lift metrics (capture +
                    activation)
                  </li>
                </ul>
              </section>

              <section aria-labelledby='faq'>
                <h2
                  id='faq'
                  className='text-xl sm:text-2xl font-semibold tracking-tight text-primary-token'
                >
                  FAQ
                </h2>
                <div className='mt-6 space-y-6'>
                  <div>
                    <h3 className='text-sm sm:text-base font-semibold text-primary-token'>
                      Is this just another link page?
                    </h3>
                    <p className='mt-2 text-sm sm:text-base text-secondary-token leading-relaxed'>
                      No — it’s a conversion engine. The page changes per fan,
                      and it follows up automatically.
                    </p>
                  </div>

                  <div>
                    <h3 className='text-sm sm:text-base font-semibold text-primary-token'>
                      Do I need ads?
                    </h3>
                    <p className='mt-2 text-sm sm:text-base text-secondary-token leading-relaxed'>
                      No. Jovie improves conversion on traffic you already have.
                      Retargeting is optional.
                    </p>
                  </div>

                  <div>
                    <h3 className='text-sm sm:text-base font-semibold text-primary-token'>
                      How fast can I set it up?
                    </h3>
                    <p className='mt-2 text-sm sm:text-base text-secondary-token leading-relaxed'>
                      Usually same day: swap your bio link, add tracking, and
                      choose offers.
                    </p>
                  </div>

                  <div>
                    <h3 className='text-sm sm:text-base font-semibold text-primary-token'>
                      What platforms do you support?
                    </h3>
                    <p className='mt-2 text-sm sm:text-base text-secondary-token leading-relaxed'>
                      Any outbound links. Spotify-first routing is supported in
                      MVP; more platforms expand over time.
                    </p>
                  </div>

                  <div>
                    <h3 className='text-sm sm:text-base font-semibold text-primary-token'>
                      Do you replace my email/SMS tool?
                    </h3>
                    <p className='mt-2 text-sm sm:text-base text-secondary-token leading-relaxed'>
                      Not necessarily. Jovie can start lightweight, then
                      integrate deeper as needed.
                    </p>
                  </div>
                </div>

                <div className='mt-10 rounded-2xl border border-subtle bg-surface-1 p-6'>
                  <p className='text-sm sm:text-base text-secondary-token leading-relaxed'>
                    Turn your next{' '}
                    <span className='font-semibold text-primary-token'>
                      10,000
                    </span>{' '}
                    profile views into a list you can reach.
                  </p>
                  <div className='mt-4'>
                    <Link
                      href='/waitlist'
                      className='inline-flex items-center justify-center h-10 px-4 rounded-md bg-btn-primary text-btn-primary-foreground text-sm font-medium transition-colors hover:opacity-90 focus-ring-themed'
                    >
                      Get early access →
                    </Link>
                  </div>
                </div>
              </section>
            </div>
          </Container>
        </section>
      </div>

      {/* Pre-footer CTA */}
      <NewPreFooterCTA />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { AiDemo } from '@/components/home/AiDemo';
import { AuthRedirectHandler } from '@/components/home/AuthRedirectHandler';
import { HeroSpotifySearch } from '@/components/home/HeroSpotifySearch';
import { ProfileMockup } from '@/components/home/ProfileMockup';
import { APP_NAME, APP_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';

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

/* ─── Shared inline style helpers ─── */
const WRAP = 'mx-auto max-w-[1100px] px-6';

const LOGOS = [
  'Spotify',
  'Apple Music',
  'YouTube Music',
  'Tidal',
  'Amazon Music',
  'Deezer',
  'SoundCloud',
  'Audiomack',
];

/* ─── Mock browser chrome bar ─── */
function MockBar({ url }: Readonly<{ url: string }>) {
  return (
    <div
      className='flex items-center gap-2 px-4 py-3'
      style={{
        borderBottom: '1px solid var(--linear-border-subtle)',
        fontSize: '0.75rem',
        color: 'var(--linear-text-tertiary)',
      }}
    >
      <div className='w-2 h-2 rounded-full' style={{ background: '#2a2a2a' }} />
      <div className='w-2 h-2 rounded-full' style={{ background: '#2a2a2a' }} />
      <div className='w-2 h-2 rounded-full' style={{ background: '#2a2a2a' }} />
      <span className='ml-2'>{url}</span>
    </div>
  );
}

/* ─── Divider ─── */
function Divider() {
  return <hr className='border-t border-subtle' />;
}

export default function LaunchPage() {
  return (
    <div className='relative min-h-screen'>
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

      {/* ═══ 1. HERO ═══ */}
      <section
        aria-labelledby='hero-heading'
        className='relative pt-40 md:pt-48 lg:pt-52 pb-16 md:pb-20 lg:pb-24 overflow-hidden'
      >
        <div
          className='hero-glow pointer-events-none absolute inset-0'
          aria-hidden='true'
        />

        <div className={`${WRAP} relative`}>
          <div className='flex flex-col items-center text-center'>
            <h1 id='hero-heading' className='marketing-h1-linear max-w-[780px]'>
              Your entire music career.{' '}
              <span className='text-secondary-token'>
                One intelligent link.
              </span>
            </h1>

            <p className='marketing-lead-linear mt-6 max-w-[520px] text-secondary-token'>
              Import your Spotify, get smart links for every release, and a
              link-in-bio that converts listeners into fans.
            </p>

            <p className='mt-6 text-sm text-tertiary-token'>
              Free forever. No credit card.
            </p>

            <div className='mt-4 w-full max-w-[520px]'>
              <HeroSpotifySearch />
            </div>

            <a
              href='#how-it-works'
              className='mt-6 inline-flex items-center gap-1.5 text-sm text-tertiary-token hover:text-secondary-token transition-colors focus-ring rounded'
            >
              See how it works
              <svg
                width='12'
                height='12'
                viewBox='0 0 12 12'
                fill='none'
                className='mt-px'
                aria-hidden='true'
              >
                <path
                  d='M6 2.5v7M3 7l3 3 3-3'
                  stroke='currentColor'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ═══ 2. LOGOS ═══ */}
      <div className='py-14 border-b border-subtle'>
        <div className={WRAP}>
          <div className='flex items-center justify-between flex-wrap gap-6'>
            {LOGOS.map(name => (
              <span
                key={name}
                className='text-sm font-medium text-secondary-token opacity-55'
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ 3. THESIS ═══ */}
      <section
        aria-labelledby='thesis-heading'
        className='pt-32 pb-16'
        id='how-it-works'
      >
        <div className={WRAP}>
          <h2 id='thesis-heading' className='marketing-h2-linear max-w-[680px]'>
            A new kind of artist tool.{' '}
            <span className='text-secondary-token'>
              Paste one Spotify link. Get smart links, fan capture, and a
              link-in-bio that converts &mdash; all in seconds.
            </span>
          </h2>
        </div>
      </section>

      {/* ═══ 4. PILLARS ═══ */}
      <div className={WRAP}>
        <div className='grid grid-cols-1 md:grid-cols-3 border-t border-subtle'>
          {[
            {
              num: 'FIG 0.1',
              title: 'One-click import',
              desc: 'Paste a Spotify URL. Jovie imports your discography, matches every release across platforms, and builds your profile automatically.',
            },
            {
              num: 'FIG 0.2',
              title: 'AI-native from day one',
              desc: 'An AI assistant grounded in your catalog, streaming data, and career. It writes bios, generates Canvases, and surfaces real insights.',
            },
            {
              num: 'FIG 0.3',
              title: 'Obsessively crafted',
              desc: "Your link-in-bio should feel like a product you're proud to share — not a parking lot of links with someone else's logo.",
            },
          ].map((item, i) => (
            <div
              key={item.num}
              className={`py-10 pr-8 ${i < 2 ? 'md:border-r md:border-subtle' : ''}`}
            >
              <div className='mb-4 font-mono tracking-wide text-xs text-tertiary-token'>
                {item.num}
              </div>
              <h3 className='font-medium mb-3 text-base tracking-tight leading-snug'>
                {item.title}
              </h3>
              <p className='text-sm leading-relaxed text-secondary-token'>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ 5. DYNAMIC PROFILES ═══ */}
      <div className={WRAP}>
        <Divider />
        <section
          aria-labelledby='profiles-heading'
          className='section-spacing-linear grid grid-cols-1 md:grid-cols-2 gap-x-16 items-start'
          id='features'
        >
          <div>
            <h2
              id='profiles-heading'
              className='marketing-h2-linear max-w-[440px]'
            >
              A link-in-bio built to convert,{' '}
              <span className='text-secondary-token'>not just display</span>
            </h2>
          </div>
          <div className='pt-1'>
            <p className='marketing-lead-linear max-w-[480px]'>
              Most link-in-bio pages are a graveyard of links. Yours adapts: new
              visitors get a subscribe CTA, returning fans get a listen CTA
              routed to their preferred platform.
            </p>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-10 pt-6 border-t border-subtle'>
              {[
                { num: '1.1', title: 'Adaptive CTA' },
                { num: '1.2', title: 'Email + SMS Capture' },
                { num: '1.3', title: 'Streaming Preference Memory' },
                { num: '1.4', title: 'Custom Domains' },
              ].map(sf => (
                <div key={sf.num} className='py-2'>
                  <div className='font-mono text-xs text-tertiary-token mb-1'>
                    {sf.num}
                  </div>
                  <div className='text-sm font-medium'>{sf.title}</div>
                </div>
              ))}
            </div>
            {/* Stat callout */}
            <div className='flex flex-col sm:flex-row items-baseline gap-4 pt-8 mt-8 border-t border-subtle'>
              <div className='font-medium shrink-0 text-[2.5rem] tracking-tight leading-none'>
                371%
              </div>
              <div>
                <div className='text-sm text-secondary-token leading-normal max-w-[380px]'>
                  more clicks when a page has one CTA instead of many. Pages
                  with a single action convert at 13.5% vs 10.5% for pages with
                  5+ links.
                </div>
                <div className='text-[0.7rem] text-tertiary-token mt-1'>
                  Source: WordStream, Omnisend
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ═══ 6. PROFILE MOCKUP ═══ */}
      <div className={`${WRAP} pb-16`}>
        <ProfileMockup />
      </div>

      {/* ═══ 7. SMART LINKS ═══ */}
      <div className={WRAP}>
        <Divider />
        <section
          aria-labelledby='smartlinks-heading'
          className='section-spacing-linear grid grid-cols-1 md:grid-cols-2 gap-x-16 items-start'
        >
          <div>
            <h2
              id='smartlinks-heading'
              className='marketing-h2-linear max-w-[440px]'
            >
              Every release, every platform,{' '}
              <span className='text-secondary-token'>one link</span>
            </h2>
          </div>
          <div className='pt-1'>
            <p className='marketing-lead-linear max-w-[480px]'>
              Connect Spotify and Jovie creates a smart link for every release
              &mdash; automatically matched across platforms. No manual setup.
              No maintenance.
            </p>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-10 pt-6 border-t border-subtle'>
              {[
                { num: '2.1', title: 'Auto-Created Links' },
                { num: '2.2', title: 'Platform Auto-Matching' },
                { num: '2.3', title: 'Pre-save Pages' },
                { num: '2.4', title: 'Click Analytics' },
              ].map(sf => (
                <div key={sf.num} className='py-2'>
                  <div className='font-mono text-xs text-tertiary-token mb-1'>
                    {sf.num}
                  </div>
                  <div className='text-sm font-medium'>{sf.title}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ═══ 8. RELEASES MOCKUP ═══ */}
      <div className={`${WRAP} pb-16`}>
        <div
          className='rounded-[10px] overflow-hidden'
          style={{
            background: 'var(--linear-bg-surface-0)',
            border: '1px solid var(--linear-border-subtle)',
          }}
        >
          <MockBar url='app.jov.ie — Releases' />
          {/* Banner */}
          <div
            className='flex items-center gap-3 px-5 py-3.5'
            style={{
              background:
                'linear-gradient(135deg, rgba(74,222,128,0.04), rgba(59,130,246,0.04))',
              borderBottom: '1px solid var(--linear-border-subtle)',
              fontSize: '0.8rem',
              color: 'var(--linear-text-secondary)',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>&#10024;</span>
            <div className='flex-1'>
              <div>
                <strong
                  className='font-medium'
                  style={{ color: 'var(--linear-text-primary)' }}
                >
                  We auto-created all 21 smart links for you.
                </strong>
              </div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--linear-text-tertiary)',
                  marginTop: '0.15rem',
                }}
              >
                5 are active on your free plan. Upgrade to Pro to unlock all 21
                and save ~7h of setup.
              </div>
            </div>
            <div className='flex items-center gap-1.5 font-medium ml-auto text-xs text-emerald-400'>
              <span className='w-1.5 h-1.5 rounded-full bg-emerald-400' />{' '}
              Connected
            </div>
          </div>

          {/* Content: list + detail */}
          <div className='grid grid-cols-1 md:grid-cols-[1fr_280px]'>
            {/* Releases list */}
            <div
              className='p-4 px-5'
              style={{
                borderRight: '1px solid var(--linear-border-subtle)',
              }}
            >
              {[
                {
                  title: 'The Sound',
                  type: 'Single',
                  date: 'Mar 2018',
                  badge: 'Smart Link',
                  active: true,
                  gradient: 'linear-gradient(135deg,#2d1f1a,#2a1a1a)',
                },
                {
                  title: 'Fading Light',
                  type: 'EP',
                  date: 'Nov 2019',
                  badge: 'Smart Link',
                  active: false,
                  gradient: 'linear-gradient(135deg,#1a1f2d,#1a1a2e)',
                },
                {
                  title: 'Where It Goes',
                  type: 'Single',
                  date: 'Jun 2020',
                  badge: 'Pro',
                  active: false,
                  gradient: 'linear-gradient(135deg,#1f2d1a,#1a2a1a)',
                },
                {
                  title: 'Signals',
                  type: 'Album',
                  date: 'Feb 2022',
                  badge: 'Pro',
                  active: false,
                  gradient: 'linear-gradient(135deg,#2a1f3d,#1a1a2e)',
                },
              ].map(r => (
                <div
                  key={r.title}
                  className='flex items-center gap-3 p-2 rounded-md'
                  style={{
                    background: r.active ? 'rgba(255,255,255,0.03)' : undefined,
                  }}
                >
                  <div
                    className='w-10 h-10 rounded shrink-0'
                    style={{ background: r.gradient }}
                  />
                  <div className='flex-1'>
                    <div
                      className='font-medium'
                      style={{ fontSize: '0.85rem' }}
                    >
                      {r.title}
                    </div>
                    <div
                      className='flex items-center gap-2 mt-0.5'
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--linear-text-tertiary)',
                      }}
                    >
                      <span
                        className='uppercase tracking-wide'
                        style={{
                          fontSize: '0.6rem',
                          padding: '0.1rem 0.3rem',
                          borderRadius: 2,
                          background: 'rgba(255,255,255,0.05)',
                        }}
                      >
                        {r.type}
                      </span>
                      {r.date}
                      <span
                        style={{
                          fontSize: '0.6rem',
                          padding: '0.1rem 0.35rem',
                          borderRadius: 2,
                          background: 'rgba(74,222,128,0.06)',
                          color: 'rgb(52 211 153)',
                          opacity: r.badge === 'Pro' ? 0.4 : 0.7,
                        }}
                      >
                        {r.badge}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Detail panel */}
            <div className='p-5'>
              <div
                className='flex gap-0 mb-4'
                style={{
                  borderBottom: '1px solid var(--linear-border-subtle)',
                }}
              >
                {['Catalog', 'Links', 'Details'].map((tab, i) => (
                  <div
                    key={tab}
                    className='px-3 py-2'
                    style={{
                      fontSize: '0.75rem',
                      color:
                        i === 0
                          ? 'var(--linear-text-primary)'
                          : 'var(--linear-text-tertiary)',
                      borderBottom:
                        i === 0
                          ? '2px solid var(--linear-text-primary)'
                          : '2px solid transparent',
                    }}
                  >
                    {tab}
                  </div>
                ))}
              </div>
              <div className='font-semibold mb-1' style={{ fontSize: '1rem' }}>
                The Sound
              </div>
              <div
                className='mb-4'
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--linear-text-tertiary)',
                }}
              >
                Single &middot; March 22, 2018
              </div>
              {[
                {
                  label: 'Smart Link',
                  value: 'jov.ie/tim/the-sound',
                  isLink: true,
                },
                { label: 'Tracklist', value: '1. The Sound' },
                {
                  label: 'Matched Platforms',
                  value:
                    'Spotify, Apple Music, YouTube Music, Tidal, Amazon Music, Deezer',
                },
              ].map(field => (
                <div key={field.label} className='mb-3'>
                  <div
                    className='uppercase tracking-wide mb-0.5'
                    style={{
                      fontSize: '0.65rem',
                      color: 'var(--linear-text-tertiary)',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {field.label}
                  </div>
                  <div
                    style={{
                      fontSize: field.isLink ? '0.75rem' : '0.8rem',
                      color: field.isLink
                        ? 'rgb(52 211 153)'
                        : 'var(--linear-text-secondary)',
                      fontFamily: field.isLink
                        ? "'SF Mono', 'Fira Code', monospace"
                        : undefined,
                    }}
                  >
                    {field.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 9. DEEPLINKS ═══ */}
      <div className={WRAP}>
        <Divider />
        <section
          aria-labelledby='deeplinks-heading'
          className='section-spacing-linear grid grid-cols-1 md:grid-cols-2 gap-x-16 items-start'
        >
          <div>
            <h2
              id='deeplinks-heading'
              className='marketing-h2-linear max-w-[440px]'
            >
              One profile.{' '}
              <span className='text-secondary-token'>Infinite deeplinks.</span>
            </h2>
          </div>
          <div className='pt-1'>
            <p className='marketing-lead-linear max-w-[480px]'>
              Sometimes you want a specific action &mdash; a tip jar at shows, a
              contact page for industry, tour dates in your bio. Deeplinks point
              directly to any view of your profile.
            </p>
            <p className='marketing-lead-linear mt-4 max-w-[480px] !text-[0.95rem]'>
              Instagram allows 5 links. With deeplinks, each one goes straight
              to a specific view &mdash; zero friction.
            </p>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-10 pt-6 border-t border-subtle'>
              {[
                { num: '3.1', title: '/tip' },
                { num: '3.2', title: '/tour' },
                { num: '3.3', title: '/contact' },
                { num: '3.4', title: '/listen' },
              ].map(sf => (
                <div key={sf.num} className='py-2'>
                  <div className='font-mono text-xs text-tertiary-token mb-1'>
                    {sf.num}
                  </div>
                  <div className='text-sm font-medium'>{sf.title}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ═══ 10. IG COMPARE ═══ */}
      <div className={`${WRAP} pb-16`}>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {/* With Linktree */}
          <div
            className='rounded-[10px] overflow-hidden'
            style={{
              background: 'var(--linear-bg-surface-0)',
              border: '1px solid var(--linear-border-subtle)',
            }}
          >
            <MockBar url='Instagram · @timwhite · 1 link' />
            <div className='p-6'>
              <div
                className='uppercase tracking-wide font-medium mb-4'
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--linear-text-tertiary)',
                  letterSpacing: '0.06em',
                }}
              >
                With Linktree
              </div>
              <div
                className='flex items-center justify-between p-3 rounded-md'
                style={{
                  background: 'var(--linear-bg-surface-2)',
                  border: '1px solid var(--linear-border-subtle)',
                  fontSize: '0.78rem',
                }}
              >
                <span className='font-medium'>linktr.ee/timwhite</span>
                <span style={{ color: 'var(--linear-text-tertiary)' }}>
                  &rarr;
                </span>
              </div>
              <p
                className='mt-4'
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--linear-text-tertiary)',
                  lineHeight: 1.45,
                }}
              >
                One link &rarr; Linktree page &rarr; tap again &rarr;
                destination. Two clicks. Linktree branding.
              </p>
            </div>
          </div>

          {/* With Jovie */}
          <div
            className='rounded-[10px] overflow-hidden'
            style={{
              background: 'var(--linear-bg-surface-0)',
              border: '1px solid var(--linear-border-subtle)',
            }}
          >
            <MockBar url='Instagram · @timwhite · 5 links' />
            <div className='p-6'>
              <div
                className='uppercase tracking-wide font-medium mb-4'
                style={{
                  fontSize: '0.75rem',
                  letterSpacing: '0.06em',
                }}
              >
                With Jovie Deeplinks
              </div>
              <div className='flex flex-col gap-2'>
                {[
                  { label: 'New Music', url: 'jov.ie/tim' },
                  { label: 'Tour Dates', url: 'jov.ie/tim/tour' },
                  { label: 'Tip Jar', url: 'jov.ie/tim/tip' },
                  { label: 'Booking', url: 'jov.ie/tim/contact' },
                  { label: 'Merch', url: 'jov.ie/tim/shop' },
                ].map(link => (
                  <div
                    key={link.url}
                    className='flex items-center justify-between p-3 rounded-md'
                    style={{
                      background: 'var(--linear-bg-surface-2)',
                      border: '1px solid var(--linear-border-subtle)',
                      fontSize: '0.78rem',
                    }}
                  >
                    <span className='font-medium'>{link.label}</span>
                    <span
                      className='font-mono'
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--linear-text-tertiary)',
                      }}
                    >
                      {link.url}
                    </span>
                  </div>
                ))}
              </div>
              <p
                className='mt-4'
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--linear-text-tertiary)',
                  lineHeight: 1.45,
                }}
              >
                Five links &rarr; each goes directly to a specific view. Zero
                friction. Your branding.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 11. DEEPLINK CARDS ═══ */}
      <div className={`${WRAP} pb-16`}>
        <div
          className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-px rounded-[10px] overflow-hidden'
          style={{ background: 'var(--linear-border-subtle)' }}
        >
          {/* /tip */}
          <div
            style={{
              background: 'var(--linear-bg-surface-0)',
              padding: '2rem 1.5rem',
            }}
          >
            <div
              className='font-mono mb-3 flex items-center gap-1'
              style={{ fontSize: '0.8rem' }}
            >
              <span style={{ color: 'var(--linear-text-tertiary)' }}>
                jov.ie/tim
              </span>{' '}
              /tip
            </div>
            <p
              className='mb-5'
              style={{
                fontSize: '0.85rem',
                color: 'var(--linear-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Accept tips from fans with one tap. Print the QR code and put it
              on your merch table at shows.
            </p>
            <div
              className='rounded-md p-4'
              style={{
                background: 'var(--linear-bg-surface-1)',
                border: '1px solid var(--linear-border-subtle)',
                fontSize: '0.75rem',
              }}
            >
              <div className='flex gap-2 mb-3'>
                {['$3', '$5', '$10'].map(amt => (
                  <div
                    key={amt}
                    className='flex-1 text-center py-2 font-semibold rounded'
                    style={{
                      background:
                        amt === '$5'
                          ? 'rgba(255,255,255,0.04)'
                          : 'var(--linear-bg-surface-2)',
                      border: `1px solid ${amt === '$5' ? 'var(--linear-text-tertiary)' : 'var(--linear-border-subtle)'}`,
                      fontSize: '0.85rem',
                    }}
                  >
                    {amt}
                  </div>
                ))}
              </div>
              <div
                className='w-full py-2 rounded text-center font-medium mb-1'
                style={{
                  background: '#008CFF',
                  color: 'white',
                  fontSize: '0.7rem',
                }}
              >
                Continue with Venmo
              </div>
              <div
                className='w-full py-2 rounded text-center font-medium'
                style={{
                  background: 'var(--linear-text-primary)',
                  color: 'var(--linear-bg-footer)',
                  fontSize: '0.7rem',
                }}
              >
                Continue with Apple Pay
              </div>
              <div
                className='text-center mt-2 pt-2'
                style={{
                  borderTop: '1px solid var(--linear-border-subtle)',
                  fontSize: '0.65rem',
                  color: 'var(--linear-text-tertiary)',
                }}
              >
                &#9634; QR code for merch table &middot; prints at any size
              </div>
            </div>
          </div>

          {/* /tour */}
          <div
            style={{
              background: 'var(--linear-bg-surface-0)',
              padding: '2rem 1.5rem',
            }}
          >
            <div
              className='font-mono mb-3 flex items-center gap-1'
              style={{ fontSize: '0.8rem' }}
            >
              <span style={{ color: 'var(--linear-text-tertiary)' }}>
                jov.ie/tim
              </span>{' '}
              /tour
            </div>
            <p
              className='mb-5'
              style={{
                fontSize: '0.85rem',
                color: 'var(--linear-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Tour dates that stay in sync. Fans find the show, buy the ticket.
            </p>
            <div
              className='rounded-md p-4'
              style={{
                background: 'var(--linear-bg-surface-1)',
                border: '1px solid var(--linear-border-subtle)',
                fontSize: '0.75rem',
              }}
            >
              {[
                {
                  city: 'Atlanta, GA',
                  venue: 'The Earl · Mar 14',
                },
                {
                  city: 'Nashville, TN',
                  venue: 'Exit/In · Mar 21',
                },
                {
                  city: 'Brooklyn, NY',
                  venue: "Baby's All Right · Apr 4",
                },
              ].map(td => (
                <div
                  key={td.city}
                  className='flex justify-between items-center py-1.5'
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    color: 'var(--linear-text-secondary)',
                  }}
                >
                  <div>
                    <div
                      className='font-medium'
                      style={{
                        color: 'var(--linear-text-primary)',
                        fontSize: '0.8rem',
                      }}
                    >
                      {td.city}
                    </div>
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--linear-text-tertiary)',
                      }}
                    >
                      {td.venue}
                    </div>
                  </div>
                  <span
                    className='px-2 py-0.5 rounded-sm'
                    style={{
                      fontSize: '0.65rem',
                      border: '1px solid var(--linear-border-subtle)',
                      color: 'var(--linear-text-secondary)',
                    }}
                  >
                    Tickets
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* /contact */}
          <div
            style={{
              background: 'var(--linear-bg-surface-0)',
              padding: '2rem 1.5rem',
            }}
          >
            <div
              className='font-mono mb-3 flex items-center gap-1'
              style={{ fontSize: '0.8rem' }}
            >
              <span style={{ color: 'var(--linear-text-tertiary)' }}>
                jov.ie/tim
              </span>{' '}
              /contact
            </div>
            <p
              className='mb-5'
              style={{
                fontSize: '0.85rem',
                color: 'var(--linear-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              One link for every industry contact. Manager, agent, publicist,
              brand deals, fan mail.
            </p>
            <div
              className='rounded-md p-4'
              style={{
                background: 'var(--linear-bg-surface-1)',
                border: '1px solid var(--linear-border-subtle)',
                fontSize: '0.75rem',
              }}
            >
              {[
                { role: 'Management', name: 'Sarah Kim' },
                { role: 'Booking', name: 'Marcus Dean' },
                { role: 'Publicist', name: 'Ava Chen' },
                { role: 'Brand Deals', name: 'brands@timwhite.co' },
                { role: 'Fan Mail', name: 'hello@timwhite.co' },
              ].map(c => (
                <div
                  key={c.role}
                  className='flex justify-between items-center py-1.5'
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--linear-text-tertiary)',
                    }}
                  >
                    {c.role}
                  </span>
                  <span className='font-medium' style={{ fontSize: '0.8rem' }}>
                    {c.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* /listen */}
          <div
            style={{
              background: 'var(--linear-bg-surface-0)',
              padding: '2rem 1.5rem',
            }}
          >
            <div
              className='font-mono mb-3 flex items-center gap-1'
              style={{ fontSize: '0.8rem' }}
            >
              <span style={{ color: 'var(--linear-text-tertiary)' }}>
                jov.ie/tim
              </span>{' '}
              /listen
            </div>
            <p
              className='mb-5'
              style={{
                fontSize: '0.85rem',
                color: 'var(--linear-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Skip the profile, go straight to the music. Detects each
              listener&apos;s preferred DSP and opens the right app.
            </p>
            <div
              className='rounded-md p-4'
              style={{
                background: 'var(--linear-bg-surface-1)',
                border: '1px solid var(--linear-border-subtle)',
                fontSize: '0.75rem',
              }}
            >
              {['Spotify', 'Apple Music', 'YouTube Music', 'Tidal'].map(dsp => (
                <div
                  key={dsp}
                  className='flex items-center gap-2 py-1.5'
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    fontSize: '0.8rem',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.65rem',
                      color: 'var(--linear-text-tertiary)',
                    }}
                  >
                    &#9654;
                  </span>
                  <span className='flex-1 font-medium'>{dsp}</span>
                  <span
                    className='px-1.5 py-0.5 rounded-sm'
                    style={{
                      fontSize: '0.65rem',
                      color: 'var(--linear-text-tertiary)',
                      border: '1px solid var(--linear-border-subtle)',
                    }}
                  >
                    Open
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 12. AI SECTION ═══ */}
      <div className={WRAP}>
        <Divider />
        <section
          aria-labelledby='ai-heading'
          className='section-spacing-linear grid grid-cols-1 md:grid-cols-2 gap-x-16 items-start'
        >
          <div>
            <h2 id='ai-heading' className='marketing-h2-linear max-w-[440px]'>
              AI that knows{' '}
              <span className='text-secondary-token'>your music</span>
            </h2>
          </div>
          <div className='pt-1'>
            <p className='marketing-lead-linear max-w-[480px]'>
              Not a generic chatbot. Jovie&apos;s AI knows your full
              discography, streaming data, and career history. Write bios,
              generate press releases, create Spotify Canvases &mdash; grounded
              in your real catalog.
            </p>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-10 pt-6 border-t border-subtle'>
              {[
                { num: '4.1', title: 'Bio & Press Releases' },
                { num: '4.2', title: 'Spotify Canvas Generator' },
                { num: '4.3', title: 'Apple Lyrics Formatter' },
                { num: '4.4', title: 'Impersonation Alerts' },
              ].map(sf => (
                <div key={sf.num} className='py-2'>
                  <div className='font-mono text-xs text-tertiary-token mb-1'>
                    {sf.num}
                  </div>
                  <div className='text-sm font-medium'>{sf.title}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ═══ 13. AI DEMO ═══ */}
      <div className={WRAP}>
        <AiDemo />

        {/* ═══ 14. AI FEATURES GRID ═══ */}
        <div
          className='grid grid-cols-1 md:grid-cols-3 gap-px rounded-lg overflow-hidden mt-8'
          style={{ background: 'var(--linear-border-subtle)' }}
        >
          {[
            {
              title: 'Spotify Canvas',
              desc: 'Turn your album art into an animated Canvas loop. Upload-ready for Spotify for Artists.',
              icon: (
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={1.5}
                  className='w-[18px] h-[18px]'
                  aria-hidden='true'
                >
                  <circle cx='12' cy='12' r='10' />
                  <polygon
                    points='10,8 16,12 10,16'
                    fill='currentColor'
                    stroke='none'
                  />
                </svg>
              ),
            },
            {
              title: 'Chat Editing',
              desc: 'Edit your profile, smart links, and bio through natural language. Just tell it what to change.',
              icon: (
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={1.5}
                  className='w-[18px] h-[18px]'
                  aria-hidden='true'
                >
                  <path d='M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' />
                </svg>
              ),
            },
            {
              title: 'Impersonation Alerts',
              desc: 'Get notified when someone creates a fake profile using your name or artwork on Spotify.',
              icon: (
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={1.5}
                  className='w-[18px] h-[18px]'
                  aria-hidden='true'
                >
                  <path d='M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' />
                </svg>
              ),
            },
            {
              title: 'Apple Lyrics',
              desc: 'Paste your lyrics and get Apple-approved formatting — timed, synced, and ready to submit.',
              icon: (
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={1.5}
                  className='w-[18px] h-[18px]'
                  aria-hidden='true'
                >
                  <path d='M9 18V5l12-2v13' />
                  <circle cx='6' cy='18' r='3' />
                  <circle cx='18' cy='16' r='3' />
                </svg>
              ),
            },
            {
              title: 'Press Releases',
              desc: 'Generate a press release grounded in your actual discography, data, and career milestones.',
              icon: (
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={1.5}
                  className='w-[18px] h-[18px]'
                  aria-hidden='true'
                >
                  <path d='M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z' />
                  <polyline points='14,2 14,8 20,8' />
                  <line x1='16' y1='13' x2='8' y2='13' />
                  <line x1='16' y1='17' x2='8' y2='17' />
                </svg>
              ),
            },
            {
              title: 'Career Insights',
              desc: 'Ask it anything about your streams, growth trajectory, or release performance. It knows.',
              icon: (
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={1.5}
                  className='w-[18px] h-[18px]'
                  aria-hidden='true'
                >
                  <polyline points='22,12 18,12 15,21 9,3 6,12 2,12' />
                </svg>
              ),
            },
          ].map(card => (
            <div
              key={card.title}
              className='p-5'
              style={{ background: 'var(--linear-bg-surface-0)' }}
            >
              <div
                className='mb-2'
                style={{ color: 'var(--linear-text-tertiary)' }}
              >
                {card.icon}
              </div>
              <div
                className='font-medium mb-1.5'
                style={{ fontSize: '0.85rem' }}
              >
                {card.title}
              </div>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--linear-text-tertiary)',
                  lineHeight: 1.45,
                }}
              >
                {card.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ 15. AUDIENCE INTELLIGENCE ═══ */}
      <div className={WRAP}>
        <Divider />
        <section
          aria-labelledby='audience-heading'
          className='section-spacing-linear grid grid-cols-1 md:grid-cols-2 gap-x-16 items-start'
        >
          <div>
            <h2
              id='audience-heading'
              className='marketing-h2-linear max-w-[440px]'
            >
              Know every fan{' '}
              <span className='text-secondary-token'>by name</span>
            </h2>
          </div>
          <div className='pt-1'>
            <p className='marketing-lead-linear max-w-[480px]'>
              Most artists have zero data on their visitors. Jovie captures
              every interaction and scores each fan by engagement &mdash; so you
              know who your real fans are.
            </p>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-10 pt-6 border-t border-subtle'>
              {[
                { num: '5.1', title: 'Fan Engagement Scoring' },
                { num: '5.2', title: 'Source Attribution' },
                { num: '5.3', title: 'Subscriber Funnel' },
                { num: '5.4', title: 'Export & Sync' },
              ].map(sf => (
                <div key={sf.num} className='py-2'>
                  <div className='font-mono text-xs text-tertiary-token mb-1'>
                    {sf.num}
                  </div>
                  <div className='text-sm font-medium'>{sf.title}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ═══ 16. AUDIENCE DASHBOARD MOCKUP ═══ */}
      <div className={`${WRAP} pb-16`}>
        <div
          className='rounded-[10px] overflow-hidden'
          style={{
            background: 'var(--linear-bg-surface-0)',
            border: '1px solid var(--linear-border-subtle)',
          }}
        >
          <MockBar url='app.jov.ie — Audience' />
          <div
            className='grid grid-cols-1 md:grid-cols-[200px_1fr]'
            style={{ minHeight: 380 }}
          >
            {/* Sidebar */}
            <div
              className='hidden md:block'
              style={{
                background: 'var(--linear-bg-surface-1)',
                borderRight: '1px solid var(--linear-border-subtle)',
                padding: '1rem 0',
                fontSize: '0.8rem',
              }}
            >
              {/* Profile */}
              <div
                className='flex items-center gap-2 px-4 pb-4 mb-2'
                style={{
                  borderBottom: '1px solid var(--linear-border-subtle)',
                }}
              >
                <div
                  className='w-7 h-7 rounded-full shrink-0'
                  style={{
                    background: 'linear-gradient(135deg, #2a1f3d, #1a1a2e)',
                  }}
                />
                <span className='font-medium' style={{ fontSize: '0.8rem' }}>
                  Tim White
                </span>
              </div>
              {/* Nav items */}
              {[
                { icon: '☰', label: 'Releases', active: false },
                { icon: '☷', label: 'Audience', active: true },
                { icon: '✉', label: 'Threads', active: false },
              ].map(item => (
                <div
                  key={item.label}
                  className='flex items-center gap-2 px-4 py-1.5'
                  style={{
                    color: item.active
                      ? 'var(--linear-text-primary)'
                      : 'var(--linear-text-tertiary)',
                    background: item.active
                      ? 'rgba(255,255,255,0.03)'
                      : undefined,
                  }}
                >
                  <span style={{ opacity: 0.5 }}>{item.icon}</span>
                  {item.label}
                </div>
              ))}
              <div
                className='uppercase tracking-wide px-4 pt-3 pb-1'
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--linear-text-tertiary)',
                  letterSpacing: '0.08em',
                  opacity: 0.6,
                }}
              >
                Admin
              </div>
              {[
                { icon: '■', label: 'Dashboard' },
                { icon: '☆', label: 'Activity' },
              ].map(item => (
                <div
                  key={item.label}
                  className='flex items-center gap-2 px-4 py-1.5'
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  <span style={{ opacity: 0.5 }}>{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>

            {/* Main */}
            <div className='p-6'>
              <div className='flex items-center justify-between mb-6'>
                <div className='font-semibold' style={{ fontSize: '1rem' }}>
                  Audience
                </div>
                <div className='flex gap-2'>
                  {['Filter', 'Display', 'Export'].map(btn => (
                    <span
                      key={btn}
                      className='px-2.5 py-1 rounded'
                      style={{
                        fontSize: '0.7rem',
                        border: '1px solid var(--linear-border-subtle)',
                        color: 'var(--linear-text-tertiary)',
                      }}
                    >
                      {btn}
                    </span>
                  ))}
                </div>
              </div>

              {/* Metrics */}
              <div
                className='grid grid-cols-3 gap-px rounded-md overflow-hidden mb-6'
                style={{ background: 'var(--linear-border-subtle)' }}
              >
                {[
                  { label: 'Views', val: '2,847', sub: '' },
                  {
                    label: 'Visitors',
                    val: '1,392',
                    sub: '48.9% of views',
                  },
                  {
                    label: 'Subscribers',
                    val: '214',
                    sub: '15.4% conversion',
                  },
                ].map(m => (
                  <div
                    key={m.label}
                    className='p-4'
                    style={{ background: 'var(--linear-bg-surface-0)' }}
                  >
                    <div
                      className='uppercase tracking-wide mb-1'
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--linear-text-tertiary)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {m.label}
                    </div>
                    <div
                      className='font-semibold'
                      style={{
                        fontSize: '1.5rem',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {m.val}
                    </div>
                    {m.sub && (
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--linear-text-tertiary)',
                          marginTop: '0.15rem',
                        }}
                      >
                        {m.sub}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Table */}
              <table className='w-full border-collapse'>
                <thead>
                  <tr>
                    {[
                      'Visitor',
                      'Engagement',
                      'Status',
                      'Source',
                      'Last Action',
                    ].map(th => (
                      <th
                        key={th}
                        scope='col'
                        className='text-left font-medium uppercase tracking-wide px-3 py-2 text-[0.7rem] text-tertiary-token border-b border-subtle'
                      >
                        {th}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      visitor: 'alex.rivera@gmail.com',
                      intent: 'High',
                      status: 'Returning',
                      source: 'Instagram',
                      action: 'Played Signals',
                    },
                    {
                      visitor: 'jordan_beats',
                      intent: 'High',
                      status: 'New',
                      source: 'Twitter',
                      action: 'Subscribed',
                    },
                    {
                      visitor: 'maya.k@outlook.com',
                      intent: 'Low',
                      status: 'New',
                      source: 'Direct',
                      action: 'Viewed profile',
                    },
                    {
                      visitor: 'chris_soundwave',
                      intent: 'High',
                      status: 'Returning',
                      source: 'Spotify',
                      action: 'Tipped $5',
                    },
                  ].map(row => (
                    <tr key={row.visitor}>
                      <td
                        className='px-3 py-2.5'
                        style={{
                          fontSize: '0.8rem',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}
                      >
                        {row.visitor}
                      </td>
                      <td
                        className='px-3 py-2.5'
                        style={{
                          fontSize: '0.8rem',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}
                      >
                        <span
                          className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm'
                          style={{
                            fontSize: '0.7rem',
                            background:
                              row.intent === 'High'
                                ? 'rgba(74,222,128,0.08)'
                                : 'rgba(255,255,255,0.04)',
                            color:
                              row.intent === 'High'
                                ? 'rgb(52 211 153)'
                                : 'var(--linear-text-tertiary)',
                          }}
                        >
                          &#9679; {row.intent}
                        </span>
                      </td>
                      <td
                        className='px-3 py-2.5'
                        style={{
                          fontSize: '0.8rem',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}
                      >
                        <span
                          className='px-1.5 py-0.5 rounded-sm'
                          style={{
                            fontSize: '0.65rem',
                            background:
                              row.status === 'New'
                                ? 'rgba(59,130,246,0.08)'
                                : 'rgba(255,255,255,0.04)',
                            color:
                              row.status === 'New'
                                ? 'rgb(59 130 246)'
                                : 'var(--linear-text-tertiary)',
                          }}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td
                        className='px-3 py-2.5'
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--linear-text-secondary)',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}
                      >
                        {row.source}
                      </td>
                      <td
                        className='px-3 py-2.5'
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--linear-text-secondary)',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}
                      >
                        {row.action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 17. TAM / WHY NOW ═══ */}
      <div className={WRAP}>
        <section
          aria-labelledby='whynow-heading'
          className='py-16 border-y border-subtle'
        >
          <h2 id='whynow-heading' className='marketing-h2-linear'>
            More creators than ever.{' '}
            <span className='text-secondary-token'>More noise than ever.</span>
          </h2>
          <p className='marketing-lead-linear mt-4 max-w-[600px]'>
            AI is creating an explosion of new music. Competition for fan
            attention has never been fiercer. Jovie is your edge.
          </p>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-12 mt-8'>
            {[
              {
                val: '7M',
                label: 'tracks generated per day on Suno alone',
                source: 'Source: Suno, 2025',
              },
              {
                val: '$60.4B',
                label: 'projected AI music market by 2034, up from $5.2B today',
                source: 'Source: Market Research Future',
              },
              {
                val: '$100',
                label:
                  'lifetime value of each email subscriber you capture through Jovie',
                source: 'Internal estimate based on direct-to-fan sales',
              },
            ].map(s => (
              <div key={s.val}>
                <div className='font-medium text-[2rem] tracking-tight'>
                  {s.val}
                </div>
                <div className='mt-1.5 text-sm text-secondary-token leading-snug'>
                  {s.label}
                </div>
                <div className='mt-1 text-[0.7rem] text-tertiary-token'>
                  {s.source}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ═══ 18. FLYWHEEL / MOAT ═══ */}
      <div className={WRAP}>
        <Divider />
        <section
          aria-labelledby='flywheel-heading'
          className='section-spacing-linear grid grid-cols-1 md:grid-cols-2 gap-x-16 items-start'
        >
          <div>
            <h2
              id='flywheel-heading'
              className='marketing-h2-linear max-w-[440px]'
            >
              Gets smarter{' '}
              <span className='text-secondary-token'>with every artist</span>
            </h2>
          </div>
          <div className='pt-1'>
            <p className='marketing-lead-linear max-w-[480px]'>
              Every artist who connects adds data to Jovie&apos;s model &mdash;
              better matching, smarter routing, better AI for everyone. Linktree
              has links. Jovie has a flywheel.
            </p>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-10 pt-6 border-t border-subtle'>
              {[
                { num: '6.1', title: 'Catalog Intelligence' },
                { num: '6.2', title: 'Cross-Artist Patterns' },
                { num: '6.3', title: 'Platform Match Accuracy' },
                { num: '6.4', title: 'Smart Routing Model' },
              ].map(sf => (
                <div key={sf.num} className='py-2'>
                  <div className='font-mono text-xs text-tertiary-token mb-1'>
                    {sf.num}
                  </div>
                  <div className='text-sm font-medium'>{sf.title}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ═══ 19. COMPARISON ═══ */}
      <section aria-labelledby='comparison-heading' className={`${WRAP} pt-16`}>
        <div className='pb-8'>
          <h2
            id='comparison-heading'
            className='marketing-h2-linear max-w-[680px]'
          >
            What you get for free.{' '}
            <span className='text-secondary-token'>
              Versus what you&apos;re probably using now.
            </span>
          </h2>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 border-t border-subtle'>
          {/* Linktree */}
          <div className='py-10 md:pr-12 md:border-r md:border-subtle'>
            <div className='uppercase tracking-wide font-medium mb-6 text-xs text-tertiary-token tracking-widest'>
              Free Linktree + nothing else
            </div>
            <ul className='list-none'>
              {[
                'Static list of links — same for every visitor',
                'No smart links — manually create each one',
                'No fan capture — zero emails, zero SMS',
                'No AI — write your own bios and press kits',
                'Linktree branding on your page',
                'No deeplinks — one link does one thing',
              ].map(item => (
                <li
                  key={item}
                  className='flex items-start gap-3 py-2.5 text-sm text-secondary-token border-b border-white/[0.04]'
                >
                  <span
                    className='shrink-0 mt-0.5 text-xs text-tertiary-token'
                    aria-hidden='true'
                  >
                    &times;
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Jovie */}
          <div className='py-10 md:pl-12'>
            <div className='uppercase tracking-wide font-medium mb-6 text-xs tracking-widest'>
              Jovie Free
            </div>
            <ul className='list-none'>
              {[
                'Adaptive CTA — subscribe or listen, per visitor',
                'Smart links auto-created for every release',
                'Email fan capture built in',
                'AI assistant with 10 queries/mo',
                'Your brand, your domain potential',
                '/tip, /tour, /contact, /listen deeplinks included',
              ].map(item => (
                <li
                  key={item}
                  className='flex items-start gap-3 py-2.5 text-sm text-secondary-token border-b border-white/[0.04]'
                >
                  <span className='shrink-0 mt-0.5 text-xs' aria-hidden='true'>
                    &check;
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ═══ 20. PRICING ═══ */}
      <section className={`${WRAP} pt-32 text-center`}>
        <h2 className='marketing-h2-linear max-w-[680px] mx-auto'>
          Simple pricing.{' '}
          <span className='text-secondary-token'>No surprises.</span>
        </h2>
        <Link
          href='/launch/pricing'
          className='marketing-cta focus-ring mt-8 inline-block'
        >
          View pricing
        </Link>
      </section>

      {/* ═══ 21. FINAL CTA ═══ */}
      <section
        aria-labelledby='cta-heading'
        className='section-spacing-linear text-center'
      >
        <div className={WRAP}>
          <h2
            id='cta-heading'
            className='marketing-h2-linear mx-auto max-w-[600px] mb-10 !text-[clamp(2.2rem,4.5vw,3.5rem)]'
          >
            Your music deserves better than a list of links.
          </h2>
          <div className='flex flex-col sm:flex-row gap-3 justify-center'>
            <Link href={APP_ROUTES.SIGNUP} className='marketing-cta focus-ring'>
              Get started free
            </Link>
            <a
              href='mailto:hello@jov.ie'
              className='focus-ring inline-flex items-center justify-center px-6 py-3 rounded-md font-medium text-sm transition-colors bg-[var(--linear-bg-surface-1)] border border-subtle hover:bg-white/[0.04]'
            >
              Contact us
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

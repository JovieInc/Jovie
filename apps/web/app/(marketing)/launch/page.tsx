import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bell,
  Check,
  Contact,
  FileText,
  ListMusic,
  Mail,
  Music2,
  Play,
  QrCode,
  Radio,
  Sparkles,
  Ticket,
  UserRound,
  X,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer, MarketingPageShell } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { AiDemo } from '@/features/home/AiDemo';
import { AuthRedirectHandler } from '@/features/home/AuthRedirectHandler';
import { ProfileMockup } from '@/features/home/ProfileMockup';
import { TIM_WHITE_PROFILE } from '@/features/home/tim-white';
import {
  buildOrganizationSchema,
  buildSoftwareSchema,
  buildWebsiteSchema,
} from '@/lib/constants/schemas';
import { publicEnv } from '@/lib/env-public';

// Marketing pages must remain fully static.
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
    authors: [{ name: APP_NAME, url: BASE_URL }],
    creator: APP_NAME,
    publisher: APP_NAME,
    category: 'Music',
    classification: 'Business',
    formatDetection: { email: false, address: false, telephone: false },
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: APP_ROUTES.LAUNCH,
      languages: { 'en-US': APP_ROUTES.LAUNCH },
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: `${BASE_URL}${APP_ROUTES.LAUNCH}`,
      title,
      description,
      siteName: APP_NAME,
      images: [
        {
          url: `${BASE_URL}/og/default.png`,
          secureUrl: `${BASE_URL}/og/default.png`,
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
          url: `${BASE_URL}/og/default.png`,
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

const WEBSITE_SCHEMA = buildWebsiteSchema({
  alternateName: 'Jovie Link in Bio',
  description:
    'Notify fans automatically and direct every visitor to the right listening destination with one focused profile.',
});

const SOFTWARE_SCHEMA = buildSoftwareSchema(
  'An AI-powered operating system for indie artists — smart links, link-in-bio, fan notifications, and AI assistant in one platform.'
);

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: 'Jovie Inc',
  description:
    'An AI-powered operating system for indie artists — smart links, link-in-bio, fan notifications, and AI assistant in one platform.',
  sameAs: ['https://twitter.com/jovie', 'https://instagram.com/jovie'],
});

const PLATFORM_LOGOS = [
  'Spotify',
  'Apple Music',
  'YouTube Music',
  'Tidal',
  'Amazon Music',
  'Deezer',
  'SoundCloud',
  'Audiomack',
] as const;

const PILLARS = [
  {
    label: 'Fig 0.1',
    title: 'One-click import',
    body: 'Paste a Spotify URL. Jovie imports your discography, matches every release, and builds the profile automatically.',
  },
  {
    label: 'Fig 0.2',
    title: 'AI-native workspace',
    body: 'The assistant is grounded in your catalog, links, streaming context, and fan activity from the first session.',
  },
  {
    label: 'Fig 0.3',
    title: 'Owned fan conversion',
    body: 'Every surface pushes toward the useful action: subscribe, listen, pay, book, or contact without extra brand noise.',
  },
] as const;

const PROFILE_FEATURES = [
  { label: '1.1', title: 'Adaptive CTA' },
  { label: '1.2', title: 'Email and SMS notifications' },
  { label: '1.3', title: 'Streaming preference memory' },
  { label: '1.4', title: 'Custom domains' },
] as const;

const RELEASES = [
  {
    title: 'The Sound',
    type: 'Single',
    date: 'Mar 2018',
    badge: 'Smart Link',
    tone: 'live',
    active: true,
  },
  {
    title: 'Fading Light',
    type: 'EP',
    date: 'Nov 2019',
    badge: 'Smart Link',
    tone: 'blue',
    active: false,
  },
  {
    title: 'Where It Goes',
    type: 'Single',
    date: 'Jun 2020',
    badge: 'Pro',
    tone: 'green',
    active: false,
  },
  {
    title: 'Signals',
    type: 'Album',
    date: 'Feb 2022',
    badge: 'Pro',
    tone: 'purple',
    active: false,
  },
] as const;

const RELEASE_FIELDS = [
  { label: 'Smart Link', value: 'jov.ie/tim/the-sound', isLink: true },
  { label: 'Tracklist', value: '1. The Sound', isLink: false },
  {
    label: 'Matched Platforms',
    value: 'Spotify, Apple Music, YouTube Music, Tidal, Amazon Music, Deezer',
    isLink: false,
  },
] as const;

const DEEPLINKS = [
  {
    route: '/pay',
    icon: QrCode,
    body: 'Accept payments from fans with one tap. Print the QR code and put it on your merch table.',
  },
  {
    route: '/tour',
    icon: Ticket,
    body: 'Tour dates stay in sync so fans can find the show and buy the ticket without hunting.',
  },
  {
    route: '/contact',
    icon: Contact,
    body: 'One tidy contact surface for management, booking, publicist, brand deals, and fan mail.',
  },
  {
    route: '/listen',
    icon: Radio,
    body: 'Skip the profile when needed and route straight to the listener preferred music app.',
  },
] as const satisfies ReadonlyArray<{
  route: string;
  icon: LucideIcon;
  body: string;
}>;

const AI_FEATURES = [
  {
    title: 'Spotify Canvas',
    body: 'Turn album art into an upload-ready Canvas loop.',
    icon: Play,
  },
  {
    title: 'Chat editing',
    body: 'Edit profile copy, links, and bio from a grounded chat surface.',
    icon: Sparkles,
  },
  {
    title: 'Impersonation alerts',
    body: 'Watch for fake profiles using your name, likeness, or artwork.',
    icon: Bell,
  },
  {
    title: 'Apple lyrics',
    body: 'Format lyrics for clean submission without manual cleanup.',
    icon: Music2,
  },
  {
    title: 'Press releases',
    body: 'Generate a release narrative from your actual catalog.',
    icon: FileText,
  },
  {
    title: 'Career insights',
    body: 'Ask about streams, growth, and performance in plain language.',
    icon: BarChart3,
  },
] as const satisfies ReadonlyArray<{
  title: string;
  body: string;
  icon: LucideIcon;
}>;

const AUDIENCE_NAV = [
  { label: 'Releases', icon: ListMusic, active: false },
  { label: 'Audience', icon: BarChart3, active: true },
  { label: 'Threads', icon: Mail, active: false },
] as const satisfies ReadonlyArray<{
  label: string;
  icon: LucideIcon;
  active: boolean;
}>;

const AUDIENCE_ROWS = [
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
    action: 'Paid $5',
  },
] as const;

const STATS = [
  {
    value: '7M',
    label: 'tracks generated per day on Suno alone',
    source: 'Source: Suno, 2025',
  },
  {
    value: '$60.4B',
    label: 'projected AI music market by 2034, up from $5.2B today',
    source: 'Source: Market Research Future',
  },
  {
    value: '$100',
    label: 'estimated lifetime value for each owned fan relationship',
    source: 'Internal direct-to-fan estimate',
  },
] as const;

const COMPARISON = [
  {
    label: 'Static link stack',
    icon: X,
    items: [
      'Same list for every visitor',
      'Manual smart-link creation',
      'No fan notification path',
      'Third-party branding in the way',
    ],
  },
  {
    label: 'Jovie free',
    icon: Check,
    items: [
      'Adaptive subscribe or listen CTA',
      'Smart links for every release',
      'Fan notifications built in',
      'Owned brand and profile context',
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  icon: LucideIcon;
  items: readonly string[];
}>;

function MockBar({ url }: Readonly<{ url: string }>) {
  return (
    <div className='system-b-launch-browser-bar'>
      <span aria-hidden='true' />
      <span aria-hidden='true' />
      <span aria-hidden='true' />
      <span>{url}</span>
    </div>
  );
}

function SectionIntro({
  headingId,
  eyebrow,
  title,
  body,
}: Readonly<{
  headingId: string;
  eyebrow: string;
  title: string;
  body: string;
}>) {
  return (
    <div className='system-b-launch-section-intro'>
      <p className='system-b-launch-kicker'>{eyebrow}</p>
      <h2 id={headingId} className='system-b-launch-section-title'>
        {title}
      </h2>
      <p className='system-b-launch-section-copy'>{body}</p>
    </div>
  );
}

function NumberedFeatureList({
  items,
}: Readonly<{ items: typeof PROFILE_FEATURES }>) {
  return (
    <div className='system-b-launch-mini-grid'>
      {items.map(item => (
        <div key={item.label} className='system-b-launch-mini-feature'>
          <span>{item.label}</span>
          <strong>{item.title}</strong>
        </div>
      ))}
    </div>
  );
}

export default function LaunchPage() {
  return (
    <MarketingPageShell className='system-b-launch-page'>
      <AuthRedirectHandler />
      <script type='application/ld+json'>{WEBSITE_SCHEMA}</script>
      <script type='application/ld+json'>{SOFTWARE_SCHEMA}</script>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>

      <main>
        <section
          aria-labelledby='hero-heading'
          className='system-b-launch-hero'
        >
          <MarketingContainer width='page'>
            <div className='system-b-launch-hero-grid'>
              <div className='system-b-launch-hero-copy'>
                <p className='system-b-launch-kicker'>Launch</p>
                <h1 id='hero-heading' className='system-b-launch-hero-title'>
                  Your entire music career. One intelligent link.
                </h1>
                <p className='system-b-launch-hero-lead'>
                  Import Spotify, create smart links for every release, and turn
                  listeners into fans you own.
                </p>
                <p className='system-b-launch-hero-note'>
                  Private launch access. No credit card.
                </p>
                <div className='system-b-launch-hero-actions'>
                  <Link
                    href={APP_ROUTES.SIGNUP}
                    className='system-b-launch-primary-link'
                  >
                    Request access
                  </Link>
                  <a
                    href='#how-it-works'
                    className='system-b-launch-secondary-link'
                  >
                    See how it works
                  </a>
                </div>
              </div>
              <div className='system-b-launch-profile-stage'>
                <ProfileMockup
                  name={TIM_WHITE_PROFILE.name}
                  handle='tim'
                  avatarUrl={TIM_WHITE_PROFILE.avatarSrc}
                />
              </div>
            </div>
          </MarketingContainer>
        </section>

        <section
          className='system-b-launch-logo-strip'
          aria-label='Supported platforms'
        >
          <MarketingContainer width='page'>
            <ul>
              {PLATFORM_LOGOS.map(name => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </MarketingContainer>
        </section>

        <section
          id='how-it-works'
          aria-labelledby='thesis-heading'
          className='system-b-launch-section'
        >
          <MarketingContainer width='page'>
            <div className='system-b-launch-thesis'>
              <h2 id='thesis-heading' className='system-b-launch-thesis-title'>
                Paste one Spotify link. Get smart links, fan notifications, and
                a link-in-bio that converts in seconds.
              </h2>
            </div>
            <div className='system-b-launch-pillar-grid'>
              {PILLARS.map(item => (
                <article key={item.label} className='system-b-launch-pillar'>
                  <span>{item.label}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </MarketingContainer>
        </section>

        <section
          aria-labelledby='profiles-heading'
          className='system-b-launch-section'
        >
          <MarketingContainer width='page'>
            <div className='system-b-launch-two-column'>
              <SectionIntro
                headingId='profiles-heading'
                eyebrow='Profile'
                title='A link-in-bio built to convert, not just display.'
                body='New visitors see the subscribe path. Returning fans see the listen path. Each action keeps the page focused.'
              />
              <div>
                <NumberedFeatureList items={PROFILE_FEATURES} />
                <div className='system-b-launch-stat-callout'>
                  <strong>371%</strong>
                  <p>
                    More clicks when a page has one CTA instead of many. Pages
                    with a single action convert at 13.5% vs 10.5% for pages
                    with five or more links.
                  </p>
                  <span>Source: WordStream, Omnisend</span>
                </div>
              </div>
            </div>
          </MarketingContainer>
        </section>

        <section
          aria-labelledby='smartlinks-heading'
          className='system-b-launch-section'
        >
          <MarketingContainer width='page'>
            <div className='system-b-launch-two-column'>
              <SectionIntro
                headingId='smartlinks-heading'
                eyebrow='Smart links'
                title='Every release, every platform, one link.'
                body='Connect Spotify once. Jovie creates and maintains matched release links across the major DSPs.'
              />
              <div className='system-b-launch-browser-frame'>
                <MockBar url='app.jov.ie / Releases' />
                <div className='system-b-launch-release-callout'>
                  <Sparkles aria-hidden='true' />
                  <div>
                    <strong>We auto-created all 21 smart links for you.</strong>
                    <p>
                      Five are active on your free plan. Upgrade to unlock the
                      rest when the catalog is ready.
                    </p>
                  </div>
                  <span>
                    <Check aria-hidden='true' />
                    Connected
                  </span>
                </div>
                <div className='system-b-launch-release-layout'>
                  <div className='system-b-launch-release-list'>
                    {RELEASES.map(release => (
                      <article
                        key={release.title}
                        className='system-b-launch-release-row'
                        data-active={release.active}
                      >
                        <span
                          className='system-b-launch-art'
                          data-tone={release.tone}
                          aria-hidden='true'
                        />
                        <div>
                          <strong>{release.title}</strong>
                          <p>
                            <span>{release.type}</span>
                            {release.date}
                            <em data-plan={release.badge}>{release.badge}</em>
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                  <aside className='system-b-launch-release-detail'>
                    <div className='system-b-launch-tabs'>
                      <span data-active='true'>Catalog</span>
                      <span>Links</span>
                      <span>Details</span>
                    </div>
                    <h3>The Sound</h3>
                    <p>Single / March 22, 2018</p>
                    {RELEASE_FIELDS.map(field => (
                      <div key={field.label} className='system-b-launch-field'>
                        <span>{field.label}</span>
                        <strong data-link={field.isLink}>{field.value}</strong>
                      </div>
                    ))}
                  </aside>
                </div>
              </div>
            </div>
          </MarketingContainer>
        </section>

        <section
          aria-labelledby='deeplinks-heading'
          className='system-b-launch-section'
        >
          <MarketingContainer width='page'>
            <SectionIntro
              headingId='deeplinks-heading'
              eyebrow='Deeplinks'
              title='One profile. Purpose-built routes for every job.'
              body='Use the same profile system for payments, shows, booking, listening, and direct fan actions.'
            />
            <div className='system-b-launch-deeplink-grid'>
              {DEEPLINKS.map(item => {
                const Icon = item.icon;
                return (
                  <article
                    key={item.route}
                    className='system-b-launch-deeplink'
                  >
                    <span>
                      <Icon aria-hidden='true' />
                    </span>
                    <h3>
                      <span>jov.ie/tim</span>
                      {item.route}
                    </h3>
                    <p>{item.body}</p>
                  </article>
                );
              })}
            </div>
          </MarketingContainer>
        </section>

        <section
          aria-labelledby='ai-heading'
          className='system-b-launch-section'
        >
          <MarketingContainer width='page'>
            <div className='system-b-launch-two-column'>
              <SectionIntro
                headingId='ai-heading'
                eyebrow='AI'
                title='AI that knows your music.'
                body='The assistant works from real catalog, streaming, link, and audience context instead of generic prompt filler.'
              />
              <div className='system-b-launch-ai-demo'>
                <AiDemo />
              </div>
            </div>
            <div className='system-b-launch-feature-grid'>
              {AI_FEATURES.map(item => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className='system-b-launch-feature'>
                    <Icon aria-hidden='true' />
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                );
              })}
            </div>
          </MarketingContainer>
        </section>

        <section
          aria-labelledby='audience-heading'
          className='system-b-launch-section'
        >
          <MarketingContainer width='page'>
            <div className='system-b-launch-two-column'>
              <SectionIntro
                headingId='audience-heading'
                eyebrow='Audience'
                title='Know every fan by name.'
                body='Jovie scores every interaction, keeps source attribution visible, and makes export or follow-up a first-class workflow.'
              />
              <div className='system-b-launch-browser-frame'>
                <MockBar url='app.jov.ie / Audience' />
                <div className='system-b-launch-audience-layout'>
                  <aside className='system-b-launch-audience-rail'>
                    <div className='system-b-launch-audience-person'>
                      <UserRound aria-hidden='true' />
                      <strong>Tim White</strong>
                    </div>
                    {AUDIENCE_NAV.map(item => {
                      const Icon = item.icon;
                      return (
                        <span key={item.label} data-active={item.active}>
                          <Icon aria-hidden='true' />
                          {item.label}
                        </span>
                      );
                    })}
                  </aside>
                  <div className='system-b-launch-audience-main'>
                    <div className='system-b-launch-toolbar'>
                      <h3>Audience</h3>
                      <div>
                        <span>Filter</span>
                        <span>Display</span>
                        <span>Export</span>
                      </div>
                    </div>
                    <div className='system-b-launch-metrics'>
                      {[
                        ['Views', '2,847', ''],
                        ['Visitors', '1,392', '48.9% of views'],
                        ['Subscribers', '214', '15.4% conversion'],
                      ].map(([label, value, sub]) => (
                        <div key={label}>
                          <span>{label}</span>
                          <strong>{value}</strong>
                          {sub ? <em>{sub}</em> : null}
                        </div>
                      ))}
                    </div>
                    <table className='system-b-launch-table'>
                      <thead>
                        <tr>
                          {[
                            'Visitor',
                            'Engagement',
                            'Status',
                            'Source',
                            'Last action',
                          ].map(heading => (
                            <th key={heading} scope='col'>
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {AUDIENCE_ROWS.map(row => (
                          <tr key={row.visitor}>
                            <td>{row.visitor}</td>
                            <td>
                              <span data-tone={row.intent}>{row.intent}</span>
                            </td>
                            <td>
                              <span data-tone={row.status}>{row.status}</span>
                            </td>
                            <td>{row.source}</td>
                            <td>{row.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </MarketingContainer>
        </section>

        <section
          aria-labelledby='whynow-heading'
          className='system-b-launch-section'
        >
          <MarketingContainer width='page'>
            <SectionIntro
              headingId='whynow-heading'
              eyebrow='Why now'
              title='More creators than ever. More noise than ever.'
              body='AI is creating more music and more competition for fan attention. Owned fan context is the edge.'
            />
            <div className='system-b-launch-stat-grid'>
              {STATS.map(stat => (
                <article key={stat.value}>
                  <strong>{stat.value}</strong>
                  <p>{stat.label}</p>
                  <span>{stat.source}</span>
                </article>
              ))}
            </div>
          </MarketingContainer>
        </section>

        <section
          aria-labelledby='comparison-heading'
          className='system-b-launch-section'
        >
          <MarketingContainer width='page'>
            <SectionIntro
              headingId='comparison-heading'
              eyebrow='Comparison'
              title='What Jovie gives you for free.'
              body='The profile stops behaving like a parking lot of links and starts behaving like a focused conversion surface.'
            />
            <div className='system-b-launch-comparison'>
              {COMPARISON.map(column => {
                const Icon = column.icon;
                return (
                  <article key={column.label}>
                    <h3>{column.label}</h3>
                    <ul>
                      {column.items.map(item => (
                        <li key={item}>
                          <Icon aria-hidden='true' />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </MarketingContainer>
        </section>

        <section
          aria-labelledby='cta-heading'
          className='system-b-launch-final'
        >
          <MarketingContainer width='page'>
            <h2 id='cta-heading'>
              Your music deserves better than a stack of links.
            </h2>
            <div>
              <Link href={APP_ROUTES.SIGNUP}>Request access</Link>
              <a href='mailto:hello@jov.ie'>Contact us</a>
            </div>
          </MarketingContainer>
        </section>
      </main>
    </MarketingPageShell>
  );
}

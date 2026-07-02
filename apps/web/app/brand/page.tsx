import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { Mark, PALETTE, Wordmark } from '@/lib/brand';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';

export const revalidate = false;

const BRAND_PAGE_TITLE =
  'Jovie Brand | The Closed-Loop Operating System for Music Artists';
const BRAND_PAGE_DESCRIPTION =
  'Jovie is the closed-loop operating system for music artists: artist profiles, smart links, presaves, fan capture, release planning, music marketing automation, and AI-powered growth systems in one lean platform.';

export const metadata: Metadata = {
  title: BRAND_PAGE_TITLE,
  description: BRAND_PAGE_DESCRIPTION,
  keywords: [
    'closed-loop operating system for music artists',
    'artist operating system',
    'music release planning',
    'artist smart links',
    'presave campaigns',
    'fan CRM',
    'music marketing automation',
    'AI agent for artists',
    'artist profile',
    'release growth flywheel',
  ],
  openGraph: {
    title: BRAND_PAGE_TITLE,
    description: BRAND_PAGE_DESCRIPTION,
    url: `${BASE_URL}/brand`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND_PAGE_TITLE,
    description: BRAND_PAGE_DESCRIPTION,
  },
  alternates: {
    canonical: `${BASE_URL}/brand`,
  },
  robots: { index: true, follow: true },
};

const BRAND_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: BRAND_PAGE_TITLE,
  description: BRAND_PAGE_DESCRIPTION,
  url: `${BASE_URL}/brand`,
  isPartOf: { '@type': 'WebSite', name: APP_NAME, url: BASE_URL },
  about: {
    '@type': 'Organization',
    name: APP_NAME,
    description:
      'Closed-loop operating system for music artists with AI agents for release planning, fan capture, and marketing automation.',
    url: BASE_URL,
    knowsAbout: [
      'AI agent for artists',
      'artist operating system',
      'music marketing automation',
      'release growth flywheel',
    ],
  },
  keywords: ['Jovie', 'artist OS', 'music marketing'],
  dateModified: new Date().toISOString(),
};

const sectionShell = 'system-b-brand-section';
const firstSectionShell =
  'system-b-brand-section system-b-brand-section--first';
const sectionHeading = 'system-b-brand-section-title';
const prose = 'system-b-brand-copy';
const proseStrong = 'system-b-brand-copy system-b-brand-copy--strong';
const smallText = 'system-b-brand-small';

const DOWNLOADS = [
  // Marks (light/dark)
  {
    label: 'SVG Mark — Ink (dark)',
    file: 'Jovie-Logo-Mark-Black.svg',
    href: '/brand/Jovie-Logo-Mark-Black.svg',
  },
  {
    label: 'SVG Mark — Cream (light)',
    file: 'Jovie-Logo-Mark-Cream.svg',
    href: '/brand/Jovie-Logo-Mark-Cream.svg',
  },
  // Wordmarks (light/dark)
  {
    label: 'SVG Wordmark — Ink (dark)',
    file: 'Jovie-Wordmark-Black.svg',
    href: '/brand/Jovie-Wordmark-Black.svg',
  },
  {
    label: 'SVG Wordmark — Cream (light)',
    file: 'Jovie-Wordmark-Cream.svg',
    href: '/brand/Jovie-Wordmark-Cream.svg',
  },
  // Lockups (light/dark)
  {
    label: 'SVG Lockup — Ink (dark)',
    file: 'Jovie-Lockup-Black.svg',
    href: '/brand/Jovie-Lockup-Black.svg',
  },
  {
    label: 'SVG Lockup — Cream (light)',
    file: 'Jovie-Lockup-Cream.svg',
    href: '/brand/Jovie-Lockup-Cream.svg',
  },
  // Raster assets
  {
    label: 'PNG Mark, 1024',
    file: 'apple-touch-icon.png',
    href: '/apple-touch-icon.png',
  },
  {
    label: 'PNG Favicon, 32',
    file: 'favicon-32x32.png',
    href: '/favicon-32x32.png',
  },
  {
    label: 'PNG PWA, 192',
    file: 'web-app-manifest-192x192.png',
    href: '/web-app-manifest-192x192.png',
  },
  {
    label: 'PNG PWA, 512',
    file: 'web-app-manifest-512x512.png',
    href: '/web-app-manifest-512x512.png',
  },
] as const;

const TYPE_SAMPLES = [
  'The link your music deserves.',
  'One loop. Every release.',
  'The artist is the company.',
] as const;

export default function BrandPage() {
  return (
    <div className='system-b-brand-page'>
      <script type='application/ld+json'>
        {safeJsonLdStringify(BRAND_SCHEMA)}
      </script>
      <HeroSection />
      <ThesisSection />
      <MarkSection />
      <WordmarkSection />
      <LockupsSection />
      <UsageSection />
      <ColorSection />
      <TypeSection />
      <IconPackSection />
      <DownloadsSection />
      <FinalCta />
    </div>
  );
}

function HeroSection() {
  return (
    <section id='hero' className='system-b-brand-hero'>
      <div className='system-b-brand-hero-grid'>
        <div className='system-b-brand-hero-copy'>
          <h1 className='system-b-brand-title'>One loop. Every release.</h1>
          <div className='system-b-brand-hero-body'>
            <p className={proseStrong}>
              Jovie is becoming the closed-loop operating system for music
              artists.
            </p>
            <p className={prose}>
              A single surface where releases, fans, links, tasks, payments,
              shows, and signals return to one place.
            </p>
            <p className={proseStrong}>
              Attention becomes action. Action becomes data. Data becomes the
              next release.
            </p>
            <p className={prose}>That is the loop.</p>
          </div>
          <div className='system-b-brand-actions'>
            <Link
              href='#downloads'
              className='system-b-brand-primary-link'
              data-primary-action='true'
            >
              Download brand kit
            </Link>
            <Link href='#mark' className='system-b-brand-text-link'>
              View guidelines
            </Link>
          </div>
        </div>
        <div className='system-b-brand-hero-mark'>
          <Mark size={240} title='Jovie mark' />
        </div>
      </div>
    </section>
  );
}

function ThesisSection() {
  return (
    <section id='thesis' className={firstSectionShell}>
      <div>
        <h2 className={sectionHeading}>The artist is the company.</h2>
      </div>
      <div className='system-b-brand-copy-stack'>
        <p className={proseStrong}>
          Music has always moved in loops. Write. Release. Reach. Learn. Return.
        </p>
        <p className={prose}>
          The old system broke that loop into tools: link-in-bio pages,
          presaves, spreadsheets, email lists, analytics dashboards, task
          managers, payment links, and half-remembered conversations.
        </p>
        <p className={proseStrong}>Jovie closes it.</p>
        <p className={prose}>
          Every release creates a fan path. Every fan path creates signal. Every
          signal improves the next action. Every action raises the artist one
          step.
        </p>
        <p className={prose}>
          The profile becomes a career staircase that exists in its own
          footprint. It does not sprawl. It rises.
        </p>
        <p className={prose}>
          This is our theory of growth: subtraction creates power. Remove the
          dead tools, the duplicate work, the forgotten data, the unnecessary
          handoffs. Keep only the system that learns.
        </p>
        <p className={proseStrong}>
          A closed loop is more than automation. It is memory with motion.
        </p>
        <div className='system-b-brand-copy-callout'>
          <p className={proseStrong}>
            Jovie is building the vertical operating system for music artists.
          </p>
          <p className={prose}>
            The wedge is the artist profile: a high-conversion surface for
            links, releases, fan capture, payments, and calls to action. The
            expansion is the release system: presaves, notifications, launch
            tasks, analytics, campaigns, and AI agents. The compounding layer is
            the closed loop: every release teaches the system how to route the
            next one.
          </p>
          <p className={prose}>
            This is not another creator tool. It is infrastructure for the
            artist-as-company.
          </p>
          <p className={proseStrong}>
            One artist. One system. A career that compounds.
          </p>
        </div>
      </div>
    </section>
  );
}

function MarkSection() {
  return (
    <section id='mark' className={sectionShell}>
      <div>
        <h2 className={sectionHeading}>A loop with a dot.</h2>
        <div className='system-b-brand-mark-stage'>
          <Mark size={180} title='Jovie loop mark' />
        </div>
      </div>
      <div className='system-b-brand-copy-stack'>
        <p className={proseStrong}>The mark is the company, reduced.</p>
        <p className={prose}>
          The loop is the system. The dot is the artist. Small in the geometry.
          Central in the meaning.
        </p>
        <p className={prose}>
          Around the artist, everything returns: releases, fans, shows,
          payments, tasks, insights, and the next decision.
        </p>
        <p className={proseStrong}>Nothing is decorative. Nothing is extra.</p>
        <p className={prose}>
          The mark is strict because the product is strict. It is quiet because
          the artist should be loud.
        </p>
        <Guideline title='Construction'>
          The mark is built from two circles on a single vertical axis. The
          dot&apos;s diameter is half the inner ring&apos;s diameter. One rule,
          many consequences.
        </Guideline>
        <Guideline title='Clear space'>
          Give the mark room to think. Reserve a clear field equal to the
          dot&apos;s diameter on every side. Nothing enters that field.
        </Guideline>
        <Guideline title='Minimum sizes'>
          The dot must remain visibly separate from the loop. When the mark
          becomes too small to hold the relationship, use the solid favicon
          variant. Clarity wins.
        </Guideline>
      </div>
    </section>
  );
}

function WordmarkSection() {
  return (
    <section id='wordmark' className={sectionShell}>
      <div>
        <h2 className={sectionHeading}>JOVIE.</h2>
        <div className='system-b-brand-wordmark-stage'>
          <Wordmark height={72} title='Jovie wordmark' />
        </div>
      </div>
      <div className='system-b-brand-copy-stack'>
        <p className={proseStrong}>Drawn, not typed.</p>
        <p className={prose}>
          The wordmark is built to feel inevitable: five letters, one system, no
          excess.
        </p>
        <p className={prose}>
          The O carries the same logic as the mark. The spacing is hand-tuned.
          The weight is even. The geometry is calm.
        </p>
        <p className={prose}>
          It should feel less like a logo and more like product infrastructure:
          a name that can sit on a profile, a deck, a dashboard, a tour bus, a
          release page, or an investor memo without changing its voice.
        </p>
        <Guideline title='Uniform stem'>
          Every stroke carries the same optical weight. No letter asks for more
          attention than it earns.
        </Guideline>
        <Guideline title='O equals the loop'>
          The O inherits the mark&apos;s circular logic. The word and the symbol
          belong to the same system.
        </Guideline>
        <Guideline title='Hand-tuned tracking'>
          Each pair gets the space its shape requires. The result should feel
          automatic, never mechanical.
        </Guideline>
      </div>
    </section>
  );
}

function LockupsSection() {
  return (
    <section id='lockups' className={sectionShell}>
      <div>
        <h2 className={sectionHeading}>One system. Many surfaces.</h2>
      </div>
      <div className='system-b-brand-copy-stack'>
        <p className={prose}>
          Jovie should feel native everywhere: a release page, an artist
          profile, a mobile icon, a deck, a festival screen, a label dashboard,
          a creator&apos;s phone.
        </p>
        <p className={prose}>
          The horizontal lockup is the default. The stacked lockup is for square
          surfaces. The mark alone is for product chrome, app icons, and places
          where the system has already earned recognition.
        </p>
        <p className={proseStrong}>
          The integrated lockup is reserved for moments where the wordmark can
          carry the full brand by itself.
        </p>
        <div className='system-b-brand-lockups'>
          <Wordmark height={54} title='Jovie wordmark lockup' />
          <Wordmark height={54} markAsO title='Jovie integrated lockup' />
          <Mark size={88} title='Jovie mark-only lockup' />
        </div>
      </div>
    </section>
  );
}

function UsageSection() {
  return (
    <section id='usage' className={sectionShell}>
      <div>
        <h2 className={sectionHeading}>Quiet system. Loud artist.</h2>
      </div>
      <div className='system-b-brand-copy-stack'>
        <p className={prose}>
          Jovie does not compete with the artist. The mark is always one color.
          The contrast is always clear. The surface can move. The symbol stays
          still.
        </p>
        <p className={proseStrong}>
          No gradients on the mark. No effects. No borrowed energy.
        </p>
        <p className={prose}>
          Artists bring the color. Jovie brings the structure.
        </p>
        <Guideline title='Use'>
          Cream on ink. Ink on cream. Cream on midnight. Black and white.
          Single-hue surfaces. High contrast. Photo and gradient surfaces only
          when the mark remains clean.
        </Guideline>
        <Guideline title='Avoid'>
          Do not rotate, stretch, outline, shade, lower contrast, reshape the
          dot, or crowd the loop. The mark is already doing the work.
        </Guideline>
      </div>
    </section>
  );
}

function ColorSection() {
  return (
    <section id='color' className={sectionShell}>
      <div>
        <h2 className={sectionHeading}>No brand color.</h2>
      </div>
      <div className='system-b-brand-copy-stack'>
        <p className={proseStrong}>Jovie is not the headline. The artist is.</p>
        <p className={prose}>
          Cream and ink do the structural work. Feature hues carry hierarchy
          inside the product. The palette behaves like a system, not a mood
          board.
        </p>
        <p className={prose}>
          Color should clarify state, signal movement, and create rhythm. It
          should never become the brand itself.
        </p>
        <div className='system-b-brand-color-grid'>
          <ColorList
            title='Surface ladder'
            items={PALETTE.surface.map(color => `${color.name} ${color.hex}`)}
          />
          <ColorList
            title='Feature hues'
            items={PALETTE.feature.map(color => `${color.name} ${color.hex}`)}
          />
        </div>
        <p className={smallText}>
          Use feature hues for titles, data highlights, and release states. Do
          not use them as large brand surfaces, button fills, or decoration
          without function.
        </p>
      </div>
    </section>
  );
}

function TypeSection() {
  return (
    <section id='type' className={sectionShell}>
      <div>
        <h2 className={sectionHeading}>Type as interface.</h2>
      </div>
      <div className='system-b-brand-copy-stack'>
        <p className={prose}>
          Jovie&apos;s typography should feel like a product edited down to its
          necessary parts.
        </p>
        <p className={prose}>
          Display type carries the thesis. Body type carries the explanation. UI
          type carries the work.
        </p>
        <p className={proseStrong}>
          Satoshi for display. DM Sans for body. Inter for product UI. Three
          voices. One system.
        </p>
        <div className='system-b-brand-type-stack'>
          {TYPE_SAMPLES.map(sample => (
            <p key={sample} className='system-b-brand-type-sample'>
              {sample}
            </p>
          ))}
        </div>
        <p className={prose}>
          Jovie brings artist profiles, smart links, presaves, fan capture,
          payments, release planning, and AI-powered music marketing automation
          into one closed-loop workspace.
        </p>
      </div>
    </section>
  );
}

function IconPackSection() {
  return (
    <section id='icons' className={sectionShell}>
      <div>
        <h2 className={sectionHeading}>The loop travels.</h2>
      </div>
      <div className='system-b-brand-copy-stack'>
        <p className={prose}>
          The mark is built for every container the operating system can throw
          at it: favicons, PWA icons, app icons, social avatars, decks,
          dashboards, release pages, and mobile surfaces.
        </p>
        <p className={proseStrong}>
          Render once. Deploy everywhere. The same path. The same proportion.
          The same loop.
        </p>
        <div className='system-b-brand-icon-row'>
          {[28, 40, 56, 72, 96].map(size => (
            <Mark key={size} size={size} title={`Jovie icon ${size}`} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DownloadsSection() {
  return (
    <section id='downloads' className={sectionShell}>
      <div>
        <h2 className={sectionHeading}>Take the system.</h2>
      </div>
      <div className='system-b-brand-copy-stack'>
        <p className={prose}>
          Every asset is rendered from the same source path. Vector and raster.
          Ink and cream. Small and large. Static and product-native.
        </p>
        <p className={proseStrong}>
          Use the files as shipped. Protect the geometry. Keep the loop closed.
        </p>
        <ul className='system-b-brand-downloads-list'>
          {DOWNLOADS.map(asset => (
            <li key={asset.href}>
              <Link
                href={asset.href}
                download={asset.file}
                className='system-b-brand-download-link'
              >
                {asset.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className={smallText}>
          Press or usage questions:{' '}
          <a className='system-b-brand-contact-link' href='mailto:brand@jov.ie'>
            brand@jov.ie
          </a>
        </p>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className='system-b-brand-final'>
      <div className='system-b-brand-final-inner'>
        <h2 className='system-b-brand-final-title'>
          Build the loop your career runs on.
        </h2>
        <p className='system-b-brand-final-copy'>
          Jovie turns releases into fan paths, fan paths into signal, and signal
          into the next step up.
        </p>
        <Link
          href={APP_ROUTES.SIGNUP}
          className='system-b-brand-secondary-link system-b-brand-final-link'
        >
          Start Free Trial
        </Link>
      </div>
    </section>
  );
}

function Guideline({
  title,
  children,
}: Readonly<{
  title: string;
  children: ReactNode;
}>) {
  return (
    <div className='system-b-brand-guideline'>
      <h3 className='system-b-brand-subtitle'>{title}</h3>
      <p className='system-b-brand-guideline-copy'>{children}</p>
    </div>
  );
}

function ColorList({
  title,
  items,
}: Readonly<{
  title: string;
  items: readonly string[];
}>) {
  return (
    <div>
      <h3 className='system-b-brand-subtitle'>{title}</h3>
      <ul className='system-b-brand-color-list'>
        {items.map(item => (
          <li key={item} className={smallText}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

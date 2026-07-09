import { Badge, Button } from '@jovie/ui';
import {
  ArrowDownToLine,
  Check,
  Laptop,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { FaqSection, MarketingContainer } from '@/components/marketing';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { buildBreadcrumbSchema, buildFaqSchema } from '@/lib/constants/schemas';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

export const revalidate = false;

const DOWNLOAD_URL = '/api/desktop/download';
const DESKTOP_RELEASES_HTML_URL = 'https://github.com/JovieInc/Jovie/releases';
const DESKTOP_IMAGE = getMarketingExportImage('shell-v1-releases-desktop');
const PROFILE_IMAGE = getMarketingExportImage('tim-white-profile-live-mobile');

const FAQ_ITEMS = [
  {
    question: 'Is the Mac app safe?',
    answer: `Yes. Each release is signed with Jovie's Apple Developer ID and notarized by Apple before it is published. macOS verifies the app the first time you open it.`,
  },
  {
    question: 'Does the app update itself?',
    answer:
      'Yes. Jovie checks for updates automatically and installs the latest version when you quit the app.',
  },
  {
    question: 'Does it work on Apple Silicon and Intel Macs?',
    answer:
      'Yes. Jovie for Mac is a universal app, so the same download works on both Apple Silicon and Intel Macs.',
  },
  {
    question: 'Do I need a Jovie account?',
    answer:
      'Yes. The Mac app connects to your existing Jovie workspace. You can sign in with the same account you use on jov.ie.',
  },
  {
    question: 'What about the iPhone app?',
    answer:
      'Jovie for iPhone is in internal TestFlight while we harden install, auth, Profile QR, Settings, and release reliability.',
  },
  {
    question: 'Where does the download come from?',
    answer:
      'The download button redirects to the latest signed Jovie release hosted on GitHub.',
  },
];

const PLATFORM_ROWS = [
  {
    icon: Laptop,
    label: 'Mac',
    title: 'Native desktop workspace',
    body: 'Open Jovie from your Dock, keep your release workflow out of browser noise, and stay current with automatic updates.',
    action: 'Download for Mac',
    href: DOWNLOAD_URL,
  },
  {
    icon: Smartphone,
    // eslint-disable-next-line @jovie/canonical-ui-label-casing -- Apple platform casing
    label: 'iPhone',
    title: 'Internal TestFlight alpha',
    body: 'Mobile stays private while the alpha proves auth, Profile QR, Settings, and TestFlight reliability on real devices.',
    action: 'Internal alpha only',
    href: '#ios-alpha',
  },
] as const;

const FEATURE_ROWS = [
  {
    title: 'One workspace',
    body: 'Releases, links, audience data, and campaigns stay connected to the same Jovie account you use on the web.',
  },
  {
    title: 'Signed releases',
    body: 'The Mac build is Developer ID signed, Apple notarized, and distributed from the latest GitHub release.',
  },
  {
    title: 'Daily updates',
    body: 'The app updates in the background when you quit, so internal fixes and product improvements reach your workspace quickly.',
  },
  {
    title: 'Mobile proof loop',
    body: 'The iPhone alpha focuses on install, auth return, Profile QR, Settings, and TestFlight quality before wider access.',
  },
] as const;

const REQUIREMENTS = [
  { label: 'Operating System', value: 'macOS 11 Big Sur or later' },
  { label: 'Architecture', value: 'Apple Silicon or Intel Mac' },
  { label: 'Memory', value: '4 GB RAM minimum, 8 GB recommended' },
  { label: 'Disk Space', value: '500 MB free' },
  { label: 'Network', value: 'Internet connection required' },
] as const;

export const metadata: Metadata = {
  title: 'Download Jovie',
  description: `Download the ${APP_NAME} desktop app for macOS. Code-signed, notarized by Apple, and updates itself in the background.`,
  alternates: {
    canonical: `${BASE_URL}/download`,
  },
  openGraph: {
    title: `Download ${APP_NAME}`,
    description: `${APP_NAME} for Mac, with iPhone in internal TestFlight alpha.`,
    url: `${BASE_URL}/download`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Download ${APP_NAME}`,
    description: `${APP_NAME} for Mac, with iPhone in internal TestFlight alpha.`,
  },
};

const FAQ_SCHEMA = buildFaqSchema(FAQ_ITEMS);
const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'Download', url: `${BASE_URL}/download` },
]);

export default function DownloadPage() {
  return (
    <>
      <script type='application/ld+json'>{FAQ_SCHEMA}</script>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>

      <main className='system-b-download-page'>
        <section aria-labelledby='download-hero-heading'>
          <div className='system-b-download-hero-shell'>
            <MarketingContainer
              width='page'
              className='system-b-download-hero-container'
            >
              <div className='system-b-download-hero-grid'>
                <div className='system-b-download-hero-copy'>
                  <p className='homepage-section-eyebrow'>
                    Mac app available now / iPhone alpha in TestFlight
                  </p>
                  <h1
                    id='download-hero-heading'
                    className='system-b-download-hero-title'
                  >
                    Jovie, Installed Where You Work.
                  </h1>
                  <p className='system-b-download-hero-lead'>
                    Run the native Mac workspace today. Keep the iPhone build
                    internal while we harden auth, Profile QR, and TestFlight.
                  </p>
                  <div className='mt-8 flex flex-wrap items-center gap-3'>
                    <Button
                      asChild
                      variant='primary'
                      size='lg'
                      className='gap-2 px-6 text-mid font-semibold'
                    >
                      <a
                        href={DOWNLOAD_URL}
                        data-analytics-event='download_mac_dmg'
                        data-analytics-source='download_page_hero'
                      >
                        <ArrowDownToLine
                          className='size-4'
                          aria-hidden='true'
                        />
                        Download for Mac
                      </a>
                    </Button>
                    <div className='flex items-center gap-2'>
                      <Badge variant='outline'>iPhone Alpha</Badge>
                      <Link
                        href='#ios-alpha'
                        className='text-sm font-medium text-secondary-token underline underline-offset-4 transition-colors duration-subtle hover:text-primary-token'
                      >
                        See status
                      </Link>
                    </div>
                  </div>
                  <div className='system-b-download-meta'>
                    <span>Developer ID signed</span>
                    <span>Apple notarized</span>
                    <span>Apple Silicon + Intel</span>
                  </div>
                </div>

                <div className='system-b-download-media-stage'>
                  <div className='system-b-download-desktop-frame'>
                    <Image
                      src={DESKTOP_IMAGE.publicUrl}
                      alt='Jovie native desktop workspace showing releases and release planning'
                      width={DESKTOP_IMAGE.width}
                      height={DESKTOP_IMAGE.height}
                      priority
                      sizes='(min-width: 1024px) 54vw, 92vw'
                      quality={85}
                      className='system-b-download-desktop-image'
                    />
                  </div>
                  <div className='system-b-download-phone-frame max-sm:hidden'>
                    <Image
                      src={PROFILE_IMAGE.publicUrl}
                      alt='Jovie iPhone alpha profile QR and public profile surface'
                      width={PROFILE_IMAGE.width}
                      height={PROFILE_IMAGE.height}
                      priority
                      sizes='13rem'
                      quality={85}
                      className='h-auto w-full'
                    />
                  </div>
                </div>
              </div>
            </MarketingContainer>
          </div>
        </section>

        <section className='system-b-download-platform-section'>
          <MarketingContainer width='page'>
            <div className='system-b-download-platform-grid'>
              {PLATFORM_ROWS.map(platform => {
                const Icon = platform.icon;
                const isMac = platform.label === 'Mac';
                return (
                  <div
                    key={platform.label}
                    id={isMac ? undefined : 'ios-alpha'}
                    className='system-b-download-platform-card'
                  >
                    <div className='system-b-download-platform-kicker'>
                      <Icon className='size-4' aria-hidden='true' />
                      <span>{platform.label}</span>
                    </div>
                    <h2 className='system-b-download-platform-title'>
                      {platform.title}
                    </h2>
                    <p className='system-b-download-platform-body'>
                      {platform.body}
                    </p>
                    {isMac ? (
                      <a
                        href={platform.href}
                        className='system-b-download-platform-action'
                        data-analytics-event='download_mac_dmg'
                        data-analytics-source='download_page_platform'
                      >
                        <ArrowDownToLine
                          className='size-4'
                          aria-hidden='true'
                        />
                        {platform.action}
                      </a>
                    ) : (
                      <button
                        type='button'
                        disabled
                        className='system-b-download-platform-inactive'
                      >
                        {platform.action}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </MarketingContainer>
        </section>

        <MarketingContainer width='page' className='system-b-download-workflow'>
          <div className='system-b-download-workflow-grid'>
            <div>
              <p className='homepage-section-eyebrow'>Release workflow</p>
              <h2 className='system-b-download-section-title'>
                Everything In Jovie, Closer.
              </h2>
            </div>
            <div className='grid gap-x-10 gap-y-10 sm:grid-cols-2'>
              {FEATURE_ROWS.map(row => (
                <section key={row.title}>
                  <div className='system-b-download-feature-icon'>
                    <Check className='size-4' aria-hidden='true' />
                  </div>
                  <h3 className='system-b-download-feature-title'>
                    {row.title}
                  </h3>
                  <p className='system-b-download-feature-body'>{row.body}</p>
                </section>
              ))}
            </div>
          </div>
        </MarketingContainer>

        <section className='system-b-download-details-section'>
          <MarketingContainer
            width='page'
            className='system-b-download-details-container'
          >
            <div className='system-b-download-details-grid'>
              <div>
                <p className='homepage-section-eyebrow'>Install details</p>
                <h2 className='system-b-download-details-title'>
                  Built To Stay Out Of The Way.
                </h2>
              </div>
              <div className='grid gap-8 sm:grid-cols-3'>
                <div>
                  <ShieldCheck className='system-b-download-detail-icon' />
                  <h3 className='system-b-download-detail-title'>Signed</h3>
                  <p className='system-b-download-detail-body'>
                    Developer ID signed and notarized before release.
                  </p>
                </div>
                <div>
                  <Sparkles className='system-b-download-detail-icon' />
                  <h3 className='system-b-download-detail-title'>Updating</h3>
                  <p className='system-b-download-detail-body'>
                    New builds install automatically after you quit.
                  </p>
                </div>
                <div>
                  <QrCode className='system-b-download-detail-icon' />
                  <h3 className='system-b-download-detail-title'>Connected</h3>
                  <p className='system-b-download-detail-body'>
                    Same account, profile, QR, and workspace data.
                  </p>
                </div>
              </div>
            </div>

            <dl className='system-b-download-requirements'>
              {REQUIREMENTS.map(row => (
                <div
                  key={row.label}
                  className='system-b-download-requirement-row'
                >
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </MarketingContainer>
        </section>

        <FaqSection
          items={FAQ_ITEMS}
          heading='Questions'
          headingClassName='system-b-download-faq-heading'
          className='system-b-download-faq'
          analyticsEventName='download_faq_opened'
          analyticsProperties={{ source: 'download' }}
        />

        <MarketingFooterCta
          title='Ready to install Jovie?'
          body='Download the Mac app today. The iPhone build stays internal while auth and TestFlight quality harden.'
          ctaLabel='Download for Mac'
          ctaHref={DOWNLOAD_URL}
          ctaAnalyticsEvent='download_mac_dmg'
          ctaAnalyticsSource='download_page_footer'
        />

        <MarketingContainer width='page' className='py-8'>
          <p className='system-b-download-legal'>
            Releases are hosted on{' '}
            <a
              href={DESKTOP_RELEASES_HTML_URL}
              target='_blank'
              rel='noopener noreferrer'
              className='system-b-download-legal-link'
            >
              GitHub
            </a>
            . By downloading the app you agree to the {APP_NAME}{' '}
            <Link
              href={APP_ROUTES.LEGAL_TERMS}
              className='system-b-download-legal-link'
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href={APP_ROUTES.LEGAL_PRIVACY}
              className='system-b-download-legal-link'
            >
              Privacy Policy
            </Link>
            .
          </p>
        </MarketingContainer>
      </main>
    </>
  );
}

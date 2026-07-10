import { Badge, Button, Link as UiLink } from '@jovie/ui';
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

const muted = 'text-secondary-token';
const soft = 'text-tertiary-token';
const legalLinkClassName =
  'underline underline-offset-2 decoration-(--linear-border-default) transition-colors duration-subtle ease-subtle hover:text-secondary-token';

/**
 * /download — reuses MarketingContainer, homepage-section-eyebrow,
 * public-action-*, Button, Badge, and FaqSection. No page-scoped
 * download CSS class layer (JOV-3872).
 */
export default function DownloadPage() {
  return (
    <>
      <script type='application/ld+json'>{FAQ_SCHEMA}</script>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>

      <main
        data-page='download'
        className='overflow-x-clip bg-(--system-b-cinematic-black) text-(--system-b-text-primary)'
      >
        <section aria-labelledby='download-hero-heading'>
          <div className='relative flex min-h-svh flex-col overflow-hidden pt-28 sm:pt-32'>
            <MarketingContainer
              width='page'
              className='relative z-3 flex flex-1 flex-col'
            >
              <div className='grid min-h-0 flex-1 items-center gap-12 pb-16 sm:pb-20 lg:grid-cols-2 lg:gap-16 lg:pb-24'>
                <div className='max-w-xl'>
                  <p className='homepage-section-eyebrow'>
                    Mac app available now / iPhone alpha in TestFlight
                  </p>
                  <h1
                    id='download-hero-heading'
                    className='mt-5 text-balance text-5xl font-bold leading-none tracking-normal text-(--system-b-text-primary) sm:text-6xl'
                  >
                    Jovie, Installed Where You Work.
                  </h1>
                  <p
                    className={`mt-6 max-w-xl text-balance text-lg leading-relaxed tracking-normal ${muted}`}
                  >
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
                      <UiLink
                        asChild
                        variant='subtle'
                        className='text-sm font-medium'
                      >
                        <Link href='#ios-alpha'>See status</Link>
                      </UiLink>
                    </div>
                  </div>
                  <div
                    className={`mt-6 flex flex-wrap gap-x-5 gap-y-2 text-app leading-5 ${soft}`}
                  >
                    <span>Developer ID signed</span>
                    <span>Apple notarized</span>
                    <span>Apple Silicon + Intel</span>
                  </div>
                </div>

                <div className='relative min-h-96 lg:min-h-144'>
                  <div className='absolute inset-x-0 top-8 bottom-0 overflow-hidden rounded-xl border border-subtle bg-surface-1/5 shadow-card'>
                    <Image
                      src={DESKTOP_IMAGE.publicUrl}
                      alt='Jovie native desktop workspace showing releases and release planning'
                      width={DESKTOP_IMAGE.width}
                      height={DESKTOP_IMAGE.height}
                      priority
                      sizes='(min-width: 1024px) 54vw, 92vw'
                      quality={85}
                      className='h-full w-full object-cover object-left-top opacity-90'
                    />
                  </div>
                  <div className='absolute top-0 right-0 w-52 overflow-hidden rounded-3xl border border-subtle bg-(--system-b-cinematic-black) shadow-card max-sm:hidden'>
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

        <section className='border-y border-subtle bg-(--system-b-cinematic-black)'>
          <MarketingContainer width='page'>
            <div className='grid lg:grid-cols-2'>
              {PLATFORM_ROWS.map((platform, index) => {
                const Icon = platform.icon;
                const isMac = platform.label === 'Mac';
                return (
                  <div
                    key={platform.label}
                    id={isMac ? undefined : 'ios-alpha'}
                    className={
                      index === 0
                        ? 'border-subtle py-12 sm:py-16 max-lg:border-b lg:border-r lg:pr-12 lg:pl-0 xl:pr-16'
                        : 'border-subtle py-12 sm:py-16 lg:pl-12 lg:pr-0 xl:pl-16'
                    }
                  >
                    <div className={`flex items-center gap-3 ${soft}`}>
                      <Icon className='size-4' aria-hidden='true' />
                      <span className='text-xs font-semibold uppercase tracking-widest'>
                        {platform.label}
                      </span>
                    </div>
                    <h2 className='mt-5 max-w-xs text-balance text-3xl font-bold leading-tight tracking-normal text-(--system-b-text-primary) lg:text-5xl'>
                      {platform.title}
                    </h2>
                    <p
                      className={`mt-4 max-w-lg text-base leading-relaxed ${muted}`}
                    >
                      {platform.body}
                    </p>
                    {isMac ? (
                      <a
                        href={platform.href}
                        className='public-action-primary mt-7 inline-flex h-10 items-center gap-2'
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
                        className='public-action-secondary mt-7 inline-flex h-10 cursor-not-allowed items-center opacity-60'
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

        <MarketingContainer width='page' className='py-20 sm:py-28 lg:py-32'>
          <div className='grid gap-12 lg:grid-cols-2 lg:gap-20'>
            <div>
              <p className='homepage-section-eyebrow'>Release workflow</p>
              <h2 className='mt-4 max-w-xs text-balance text-4xl font-bold leading-tight tracking-normal text-(--system-b-text-primary) lg:text-5xl'>
                Everything In Jovie, Closer.
              </h2>
            </div>
            <div className='grid gap-x-10 gap-y-10 sm:grid-cols-2'>
              {FEATURE_ROWS.map(row => (
                <section key={row.title}>
                  <div className='mb-4 flex size-8 items-center justify-center rounded-full bg-surface-1/10 text-secondary-token'>
                    <Check className='size-4' aria-hidden='true' />
                  </div>
                  <h3 className='text-xl font-semibold tracking-normal text-(--system-b-text-primary)'>
                    {row.title}
                  </h3>
                  <p className={`mt-3 text-mid leading-relaxed ${muted}`}>
                    {row.body}
                  </p>
                </section>
              ))}
            </div>
          </div>
        </MarketingContainer>

        <section className='border-y border-subtle bg-(--system-b-cinematic-black)'>
          <MarketingContainer width='page' className='py-16 sm:py-20 lg:py-24'>
            <div className='grid gap-12 lg:grid-cols-2 lg:items-start'>
              <div>
                <p className='homepage-section-eyebrow'>Install details</p>
                <h2 className='mt-4 max-w-xs text-balance text-4xl font-bold leading-tight tracking-normal text-(--system-b-text-primary) lg:text-5xl'>
                  Built To Stay Out Of The Way.
                </h2>
              </div>
              <div className='grid gap-8 sm:grid-cols-3'>
                <div>
                  <ShieldCheck
                    className={`mb-4 size-5 ${muted}`}
                    aria-hidden='true'
                  />
                  <h3 className='text-lg font-semibold text-(--system-b-text-primary)'>
                    Signed
                  </h3>
                  <p className={`mt-2 text-sm leading-relaxed ${soft}`}>
                    Developer ID signed and notarized before release.
                  </p>
                </div>
                <div>
                  <Sparkles
                    className={`mb-4 size-5 ${muted}`}
                    aria-hidden='true'
                  />
                  <h3 className='text-lg font-semibold text-(--system-b-text-primary)'>
                    Updating
                  </h3>
                  <p className={`mt-2 text-sm leading-relaxed ${soft}`}>
                    New builds install automatically after you quit.
                  </p>
                </div>
                <div>
                  <QrCode
                    className={`mb-4 size-5 ${muted}`}
                    aria-hidden='true'
                  />
                  <h3 className='text-lg font-semibold text-(--system-b-text-primary)'>
                    Connected
                  </h3>
                  <p className={`mt-2 text-sm leading-relaxed ${soft}`}>
                    Same account, profile, QR, and workspace data.
                  </p>
                </div>
              </div>
            </div>

            <dl className='mt-12 grid border-t border-subtle text-mid'>
              {REQUIREMENTS.map(row => (
                <div
                  key={row.label}
                  className='grid gap-2 border-b border-subtle py-4 sm:grid-cols-3'
                >
                  <dt className={soft}>{row.label}</dt>
                  <dd className={`sm:col-span-2 ${muted}`}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </MarketingContainer>
        </section>

        <FaqSection
          items={FAQ_ITEMS}
          heading='Questions'
          headingClassName='text-4xl font-bold leading-tight tracking-normal text-(--system-b-text-primary)'
          className='mx-auto w-full max-w-3xl px-6 py-20'
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
          <p className={`text-xs leading-5 ${soft}`}>
            Releases are hosted on{' '}
            <a
              href={DESKTOP_RELEASES_HTML_URL}
              target='_blank'
              rel='noopener noreferrer'
              className={legalLinkClassName}
            >
              GitHub
            </a>
            . By downloading the app you agree to the {APP_NAME}{' '}
            <UiLink asChild variant='bare' className={legalLinkClassName}>
              <Link href={APP_ROUTES.LEGAL_TERMS}>Terms of Service</Link>
            </UiLink>{' '}
            and{' '}
            <UiLink asChild variant='bare' className={legalLinkClassName}>
              <Link href={APP_ROUTES.LEGAL_PRIVACY}>Privacy Policy</Link>
            </UiLink>
            .
          </p>
        </MarketingContainer>
      </main>
    </>
  );
}

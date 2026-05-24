import { Button } from '@jovie/ui';
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
import {
  DESKTOP_RELEASES_HTML_URL,
  fetchLatestDesktopRelease,
} from '@/lib/desktop/github-releases';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

export const revalidate = false;

const DOWNLOAD_URL = '/api/desktop/download';
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
  { label: 'Operating system', value: 'macOS 11 Big Sur or later' },
  { label: 'Architecture', value: 'Apple Silicon or Intel Mac' },
  { label: 'Memory', value: '4 GB RAM minimum, 8 GB recommended' },
  { label: 'Disk space', value: '500 MB free' },
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

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export default async function DownloadPage() {
  const release = await fetchLatestDesktopRelease();
  const versionLabel = release?.version ? `v${release.version}` : null;
  const sizeLabel = release?.mac?.sizeBytes
    ? formatBytes(release.mac.sizeBytes)
    : null;
  const meta = [versionLabel, sizeLabel, 'Apple Silicon + Intel']
    .filter((value): value is string => Boolean(value))
    .join(' / ');

  return (
    <>
      <script type='application/ld+json'>{FAQ_SCHEMA}</script>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>

      <main className='overflow-x-clip bg-black text-white'>
        <section
          className='homepage-hero-stage relative'
          aria-labelledby='download-hero-heading'
        >
          <div className='homepage-hero-shell relative flex min-h-[100svh] flex-col overflow-hidden pt-[calc(var(--linear-header-height)+clamp(4.5rem,8vw,7rem))]'>
            <div
              aria-hidden='true'
              className='homepage-hero-shell__layer homepage-hero-shell__beam'
            />
            <div aria-hidden='true' className='homepage-hero-shell__grid-wrap'>
              <div className='homepage-hero-shell__grid' />
            </div>

            <MarketingContainer
              width='page'
              className='relative z-[3] flex flex-1 flex-col'
            >
              <div className='grid min-h-0 flex-1 items-center gap-12 pb-[clamp(3.5rem,7vw,6rem)] lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)] lg:gap-16'>
                <div className='max-w-[45rem]'>
                  <p className='homepage-section-eyebrow'>
                    Mac app available now / iPhone alpha in TestFlight
                  </p>
                  <h1
                    id='download-hero-heading'
                    className='mt-5 text-balance text-[clamp(3.3rem,7vw,7.5rem)] font-[680] leading-[0.92] tracking-[-0.055em] text-white'
                  >
                    Jovie, installed where you work.
                  </h1>
                  <p className='mt-6 max-w-[40rem] text-balance text-[clamp(1.08rem,1.55vw,1.35rem)] leading-[1.45] tracking-[-0.015em] text-white/66'>
                    Run the native Mac workspace today. Keep the iPhone build
                    internal while we harden auth, Profile QR, and TestFlight.
                  </p>
                  <div className='mt-8 flex flex-wrap items-center gap-3'>
                    <Button
                      asChild
                      variant='whitePill'
                      className='h-11 gap-2 px-6 text-[15px] font-semibold'
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
                    <Link
                      href='#ios-alpha'
                      className='inline-flex h-11 items-center rounded-full px-4 text-[15px] font-semibold text-white/72 transition-colors duration-subtle hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
                    >
                      iPhone status
                    </Link>
                  </div>
                  <div className='mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] leading-5 text-white/48'>
                    <span>Developer ID signed</span>
                    <span>Apple notarized</span>
                    {meta ? <span>{meta}</span> : null}
                  </div>
                </div>

                <div className='relative min-h-[24rem] lg:min-h-[36rem]'>
                  <div className='absolute inset-x-0 bottom-0 top-[8%] overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.035] shadow-[0_44px_140px_rgba(0,0,0,0.52)]'>
                    <Image
                      src={DESKTOP_IMAGE.publicUrl}
                      alt='Jovie native desktop workspace showing releases and release planning'
                      width={DESKTOP_IMAGE.width}
                      height={DESKTOP_IMAGE.height}
                      priority
                      sizes='(min-width: 1024px) 54vw, 92vw'
                      quality={85}
                      className='h-full w-full object-cover object-left-top opacity-92'
                    />
                  </div>
                  <div className='absolute right-0 top-0 w-[min(34vw,13rem)] overflow-hidden rounded-[28px] border border-white/[0.1] bg-black shadow-[0_28px_90px_rgba(0,0,0,0.65)] max-sm:hidden'>
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

        <section className='border-y border-white/[0.08] bg-black'>
          <MarketingContainer width='page'>
            <div className='grid divide-y divide-white/[0.08] lg:grid-cols-2 lg:divide-x lg:divide-y-0'>
              {PLATFORM_ROWS.map(platform => {
                const Icon = platform.icon;
                const isMac = platform.label === 'Mac';
                return (
                  <div
                    key={platform.label}
                    id={isMac ? undefined : 'ios-alpha'}
                    className='py-[clamp(2.5rem,5vw,4.5rem)] lg:px-[clamp(2rem,4vw,4rem)] first:lg:pl-0 last:lg:pr-0'
                  >
                    <div className='flex items-center gap-3 text-white/46'>
                      <Icon className='size-4' aria-hidden='true' />
                      <span className='text-[12px] font-semibold uppercase tracking-[0.18em]'>
                        {platform.label}
                      </span>
                    </div>
                    <h2 className='mt-5 max-w-[16ch] text-balance text-[clamp(2rem,3.2vw,3.2rem)] font-[650] leading-[1.02] tracking-[-0.04em] text-white'>
                      {platform.title}
                    </h2>
                    <p className='mt-4 max-w-[34rem] text-[16px] leading-7 text-white/58'>
                      {platform.body}
                    </p>
                    {isMac ? (
                      <a
                        href={platform.href}
                        className='mt-7 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-black transition-opacity duration-subtle hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
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
                      <div className='mt-7 inline-flex h-10 items-center rounded-full border border-white/[0.14] px-5 text-[14px] font-semibold text-white/48'>
                        {platform.action}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </MarketingContainer>
        </section>

        <MarketingContainer width='page' className='py-[clamp(5rem,9vw,8rem)]'>
          <div className='grid gap-14 lg:grid-cols-[0.72fr_1fr] lg:gap-20'>
            <div>
              <p className='homepage-section-eyebrow'>Release workflow</p>
              <h2 className='mt-4 max-w-[13ch] text-balance text-[clamp(2.5rem,4.6vw,4.8rem)] font-[650] leading-[0.98] tracking-[-0.05em] text-white'>
                Everything in Jovie, closer.
              </h2>
            </div>
            <div className='grid gap-x-10 gap-y-10 sm:grid-cols-2'>
              {FEATURE_ROWS.map(row => (
                <section key={row.title}>
                  <div className='mb-4 flex size-8 items-center justify-center rounded-full bg-white/[0.08] text-white/82'>
                    <Check className='size-4' aria-hidden='true' />
                  </div>
                  <h3 className='text-[1.35rem] font-semibold tracking-[-0.03em] text-white'>
                    {row.title}
                  </h3>
                  <p className='mt-3 text-[15px] leading-7 text-white/55'>
                    {row.body}
                  </p>
                </section>
              ))}
            </div>
          </div>
        </MarketingContainer>

        <section className='border-y border-white/[0.08] bg-[#050506]'>
          <MarketingContainer
            width='page'
            className='py-[clamp(4rem,7vw,6rem)]'
          >
            <div className='grid gap-12 lg:grid-cols-[0.78fr_1fr] lg:items-start'>
              <div>
                <p className='homepage-section-eyebrow'>Install details</p>
                <h2 className='mt-4 max-w-[13ch] text-balance text-[clamp(2.25rem,3.8vw,4rem)] font-[650] leading-[1] tracking-[-0.045em] text-white'>
                  Built to stay out of the way.
                </h2>
              </div>
              <div className='grid gap-8 sm:grid-cols-3'>
                <div>
                  <ShieldCheck className='mb-4 size-5 text-white/72' />
                  <h3 className='text-[17px] font-semibold text-white'>
                    Signed
                  </h3>
                  <p className='mt-2 text-sm leading-6 text-white/52'>
                    Developer ID signed and notarized before release.
                  </p>
                </div>
                <div>
                  <Sparkles className='mb-4 size-5 text-white/72' />
                  <h3 className='text-[17px] font-semibold text-white'>
                    Updating
                  </h3>
                  <p className='mt-2 text-sm leading-6 text-white/52'>
                    New builds install automatically after you quit.
                  </p>
                </div>
                <div>
                  <QrCode className='mb-4 size-5 text-white/72' />
                  <h3 className='text-[17px] font-semibold text-white'>
                    Connected
                  </h3>
                  <p className='mt-2 text-sm leading-6 text-white/52'>
                    Same account, profile, QR, and workspace data.
                  </p>
                </div>
              </div>
            </div>

            <dl className='mt-14 grid border-t border-white/[0.08] text-[15px]'>
              {REQUIREMENTS.map(row => (
                <div
                  key={row.label}
                  className='grid gap-2 border-b border-white/[0.08] py-4 sm:grid-cols-[minmax(9rem,0.35fr)_1fr]'
                >
                  <dt className='text-white/42'>{row.label}</dt>
                  <dd className='text-white/82'>{row.value}</dd>
                </div>
              ))}
            </dl>
          </MarketingContainer>
        </section>

        <FaqSection
          items={FAQ_ITEMS}
          heading='Questions'
          headingClassName='homepage-story-heading text-white'
          className='mx-auto w-full max-w-[760px] px-[var(--homepage-page-gutter)] py-[var(--homepage-section-space)]'
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
          <p className='text-[12px] leading-5 text-white/42'>
            Releases are hosted on{' '}
            <a
              href={DESKTOP_RELEASES_HTML_URL}
              target='_blank'
              rel='noopener noreferrer'
              className='underline decoration-white/30 underline-offset-4 transition-colors hover:text-white/70'
            >
              GitHub
            </a>
            . By downloading the app you agree to the {APP_NAME}{' '}
            <Link
              href={APP_ROUTES.LEGAL_TERMS}
              className='underline decoration-white/30 underline-offset-4 transition-colors hover:text-white/70'
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href={APP_ROUTES.LEGAL_PRIVACY}
              className='underline decoration-white/30 underline-offset-4 transition-colors hover:text-white/70'
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

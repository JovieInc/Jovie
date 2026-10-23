import { Button, Link as UiLink } from '@jovie/ui';
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
import {
  FaqSection,
  MarketingContainer,
  MarketingHeroPhoto,
} from '@/components/marketing';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { DOWNLOAD_COPY } from '@/data/downloadCopy';
import { buildBreadcrumbSchema, buildFaqSchema } from '@/lib/constants/schemas';
import { MAC_APP_SUPPORT } from '@/lib/desktop/mac-compatibility';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

export const revalidate = false;

const DOWNLOAD_URL = '/api/desktop/download';
const DESKTOP_RELEASES_HTML_URL = 'https://github.com/JovieInc/Jovie/releases';
const DESKTOP_IMAGE = getMarketingExportImage('dashboard-releases-desktop');
const PROFILE_IMAGE = getMarketingExportImage('tim-white-profile-live-mobile');
const DOWNLOAD_HERO_PHOTO = {
  src: '/images/marketing-hero/download.webp',
  width: 1600,
  height: 901,
  opacity: 0.22,
} as const;

const PLATFORM_ROWS = [
  {
    icon: Laptop,
    kind: 'mac' as const,
    ...DOWNLOAD_COPY.platforms.mac,
  },
  {
    icon: Smartphone,
    kind: 'iphone' as const,
    ...DOWNLOAD_COPY.platforms.iphone,
  },
];

const REQUIREMENTS = [
  {
    label: DOWNLOAD_COPY.requirementLabels[0],
    value: MAC_APP_SUPPORT.minimumMacOSLabel,
  },
  {
    label: DOWNLOAD_COPY.requirementLabels[1],
    value: DOWNLOAD_COPY.requirementValues.architecture,
  },
  {
    label: DOWNLOAD_COPY.requirementLabels[2],
    value: DOWNLOAD_COPY.requirementValues.memory,
  },
  {
    label: DOWNLOAD_COPY.requirementLabels[3],
    value: DOWNLOAD_COPY.requirementValues.disk,
  },
  {
    label: DOWNLOAD_COPY.requirementLabels[4],
    value: DOWNLOAD_COPY.requirementValues.network,
  },
] as const;

export const metadata: Metadata = {
  title: DOWNLOAD_COPY.metadata.title,
  description: DOWNLOAD_COPY.metadata.description,
  alternates: {
    canonical: `${BASE_URL}/download`,
  },
  openGraph: {
    title: `Download ${APP_NAME}`,
    description: DOWNLOAD_COPY.metadata.socialDescription,
    url: `${BASE_URL}/download`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Download ${APP_NAME}`,
    description: DOWNLOAD_COPY.metadata.socialDescription,
  },
};

const FAQ_SCHEMA = buildFaqSchema(DOWNLOAD_COPY.faq);
const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'Download', url: `${BASE_URL}/download` },
]);

const muted = 'text-secondary-token';
const soft = 'text-tertiary-token';
const legalLinkClassName =
  'underline underline-offset-2 decoration-(--color-border-default) transition-colors duration-subtle ease-subtle hover:text-secondary-token';

/**
 * /download — reuses MarketingContainer, homepage-section-eyebrow,
 * public-action-*, Button, and FaqSection. No page-scoped
 * download CSS class layer (JOV-3872).
 */
export default function DownloadPage() {
  return (
    <>
      <script type='application/ld+json'>{FAQ_SCHEMA}</script>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>

      <div
        data-page='download'
        className='marketing-hero-dock marketing-hero-dock--inset overflow-x-clip bg-(--system-b-cinematic-black) text-(--system-b-text-primary)'
      >
        <section
          aria-labelledby='download-hero-heading'
          data-testid='marketing-section-hero'
          data-marketing-variant='split-screenshot-right'
          data-marketing-owner='apps/web/app/(marketing)/download/page.tsx'
        >
          <div className='relative flex min-h-svh flex-col overflow-hidden pt-28 sm:pt-32'>
            <MarketingHeroPhoto {...DOWNLOAD_HERO_PHOTO} />
            <MarketingContainer
              width='page'
              className='relative z-3 flex flex-1 flex-col'
            >
              <div className='grid min-h-0 flex-1 items-start gap-12 pb-16 sm:pb-20 lg:grid-cols-2 lg:items-center lg:gap-16 lg:pb-24'>
                <div className='max-w-xl max-sm:min-h-103'>
                  <p className='homepage-section-eyebrow'>
                    {DOWNLOAD_COPY.eyebrow}
                  </p>
                  <h1
                    id='download-hero-heading'
                    className='mt-5 min-h-18 text-balance text-4xl font-bold leading-none tracking-normal text-(--system-b-text-primary) line-clamp-2 sm:min-h-30 sm:text-6xl'
                  >
                    {DOWNLOAD_COPY.headline}
                  </h1>
                  <p
                    className={`mt-6 max-w-xl text-balance text-lg leading-relaxed tracking-normal ${muted}`}
                  >
                    {DOWNLOAD_COPY.hero}
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
                        {DOWNLOAD_COPY.heroDownload}
                      </a>
                    </Button>
                    <UiLink
                      asChild
                      variant='subtle'
                      className='text-sm font-medium'
                    >
                      <Link href='#iphone'>
                        {DOWNLOAD_COPY.iphoneStatusLink}
                      </Link>
                    </UiLink>
                  </div>
                  <div
                    className={`mt-6 flex flex-wrap gap-x-5 gap-y-2 text-app leading-5 ${soft}`}
                  >
                    {DOWNLOAD_COPY.proof.map(item => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                </div>

                <div className='relative min-h-96 lg:min-h-144'>
                  <div
                    className='absolute inset-x-0 top-8 bottom-0 overflow-hidden rounded-xl border border-subtle bg-surface-1/5 shadow-card'
                    data-overlap='intentional'
                    data-testid='download-desktop-screenshot'
                  >
                    <Image
                      src={DESKTOP_IMAGE.publicUrl}
                      alt='Jovie public demo showing the releases catalog'
                      width={DESKTOP_IMAGE.width}
                      height={DESKTOP_IMAGE.height}
                      priority
                      sizes='(min-width: 1024px) 54vw, 92vw'
                      quality={85}
                      className='h-full w-full object-cover object-left-top opacity-90'
                    />
                  </div>
                  <div
                    className='absolute top-0 right-0 w-52 overflow-hidden rounded-3xl border border-subtle bg-(--system-b-cinematic-black) shadow-card max-sm:hidden'
                    data-overlap='intentional'
                  >
                    <Image
                      src={PROFILE_IMAGE.publicUrl}
                      alt={DOWNLOAD_COPY.phoneAlt}
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

        <section
          className='border-y border-subtle bg-(--system-b-cinematic-black)'
          data-testid='marketing-section-feature-grid'
          data-marketing-variant='two-column-text'
          data-marketing-owner='apps/web/app/(marketing)/download/page.tsx'
          data-marketing-occurrence='platforms'
        >
          <MarketingContainer width='page'>
            <div className='grid lg:grid-cols-2'>
              {PLATFORM_ROWS.map((platform, index) => {
                const Icon = platform.icon;
                const isMac = platform.kind === 'mac';
                return (
                  <div
                    key={platform.label}
                    id={isMac ? undefined : 'iphone'}
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
                    <h2
                      data-wrap='editorial-title'
                      className='mt-5 text-pretty text-3xl font-bold leading-tight tracking-normal text-(--system-b-text-primary) lg:text-4xl'
                    >
                      {platform.title}
                    </h2>
                    <p
                      className={`mt-4 max-w-lg text-base leading-relaxed ${muted}`}
                    >
                      {platform.body}
                    </p>
                    {isMac ? (
                      <div className='mt-7 flex flex-wrap items-center gap-3'>
                        <a
                          href={DOWNLOAD_URL}
                          className='public-action-primary inline-flex min-h-11 items-center gap-2'
                          data-analytics-event='download_mac_dmg'
                          data-analytics-source='download_page_platform'
                        >
                          <ArrowDownToLine
                            className='size-4'
                            aria-hidden='true'
                          />
                          {DOWNLOAD_COPY.platforms.mac.action}
                        </a>
                        <a
                          href={DESKTOP_RELEASES_HTML_URL}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='public-action-secondary inline-flex min-h-11 items-center'
                        >
                          {DOWNLOAD_COPY.platforms.mac.releasesAction}
                        </a>
                      </div>
                    ) : (
                      <p
                        role='status'
                        className={`mt-7 text-sm font-medium ${muted}`}
                      >
                        {DOWNLOAD_COPY.platforms.iphone.status}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </MarketingContainer>
        </section>

        <section
          data-testid='marketing-section-feature-grid'
          data-marketing-variant='4-ledger'
          data-marketing-owner='apps/web/app/(marketing)/download/page.tsx'
          data-marketing-occurrence='workflow'
        >
          <MarketingContainer width='page' className='py-20 sm:py-28 lg:py-32'>
            <div className='grid gap-12 lg:grid-cols-2 lg:gap-20'>
              <div>
                <p className='homepage-section-eyebrow'>
                  {DOWNLOAD_COPY.workflowEyebrow}
                </p>
                <h2
                  data-wrap='editorial-title'
                  className='mt-4 text-pretty text-4xl font-bold leading-tight tracking-normal text-(--system-b-text-primary) lg:text-5xl'
                >
                  {DOWNLOAD_COPY.workflowTitle}
                </h2>
              </div>
              <div className='grid gap-x-10 gap-y-10 sm:grid-cols-2'>
                {DOWNLOAD_COPY.features.map(row => (
                  <section key={row.title}>
                    <div className='mb-4 flex size-8 items-center justify-center rounded-full bg-surface-1/10 text-secondary-token'>
                      <Check className='size-4' aria-hidden='true' />
                    </div>
                    <h3 className='text-pretty text-xl font-semibold tracking-normal text-(--system-b-text-primary)'>
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
        </section>

        <section
          className='border-y border-subtle bg-(--system-b-cinematic-black)'
          data-testid='marketing-section-feature-grid'
          data-marketing-variant='3-large'
          data-marketing-owner='apps/web/app/(marketing)/download/page.tsx'
          data-marketing-occurrence='install-details'
        >
          <MarketingContainer width='page' className='py-16 sm:py-20 lg:py-24'>
            <div className='grid gap-12 lg:grid-cols-2 lg:items-start'>
              <div>
                <p className='homepage-section-eyebrow'>
                  {DOWNLOAD_COPY.installEyebrow}
                </p>
                <h2
                  data-wrap='editorial-title'
                  className='mt-4 text-pretty text-4xl font-bold leading-tight tracking-normal text-(--system-b-text-primary) lg:text-5xl'
                >
                  {DOWNLOAD_COPY.installTitle}
                </h2>
              </div>
              <div className='grid gap-8 sm:grid-cols-3'>
                <div>
                  <ShieldCheck
                    className={`mb-4 size-5 ${muted}`}
                    aria-hidden='true'
                  />
                  <h3 className='text-lg font-semibold text-(--system-b-text-primary)'>
                    {DOWNLOAD_COPY.installCards[0].title}
                  </h3>
                  <p className={`mt-2 text-sm leading-relaxed ${soft}`}>
                    {DOWNLOAD_COPY.installCards[0].body}
                  </p>
                </div>
                <div>
                  <Sparkles
                    className={`mb-4 size-5 ${muted}`}
                    aria-hidden='true'
                  />
                  <h3 className='text-lg font-semibold text-(--system-b-text-primary)'>
                    {DOWNLOAD_COPY.installCards[1].title}
                  </h3>
                  <p className={`mt-2 text-sm leading-relaxed ${soft}`}>
                    {DOWNLOAD_COPY.installCards[1].body}
                  </p>
                </div>
                <div>
                  <QrCode
                    className={`mb-4 size-5 ${muted}`}
                    aria-hidden='true'
                  />
                  <h3 className='text-lg font-semibold text-(--system-b-text-primary)'>
                    {DOWNLOAD_COPY.installCards[2].title}
                  </h3>
                  <p className={`mt-2 text-sm leading-relaxed ${soft}`}>
                    {DOWNLOAD_COPY.installCards[2].body}
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
          sectionVariant='objection-handler' /* copy-lint-allow: objection */
          items={DOWNLOAD_COPY.faq}
          heading={DOWNLOAD_COPY.faqHeading}
          headingClassName='text-4xl font-bold leading-tight tracking-normal text-(--system-b-text-primary)'
          className='mx-auto w-full max-w-3xl px-6 py-20'
          analyticsEventName='download_faq_opened'
          analyticsProperties={{ source: 'download' }}
        />

        <MarketingFooterCta
          sectionVariant='final-single-claim'
          title={DOWNLOAD_COPY.footerTitle}
          body={DOWNLOAD_COPY.footerBody}
          ctaLabel={DOWNLOAD_COPY.footerCta}
          ctaHref={DOWNLOAD_URL}
          ctaAnalyticsEvent='download_mac_dmg'
          ctaAnalyticsSource='download_page_footer'
          prefetch={false}
        />

        <MarketingContainer width='page' className='py-8'>
          <p className={`text-xs leading-5 ${soft}`}>
            {DOWNLOAD_COPY.legal.hosted}{' '}
            <a
              href={DESKTOP_RELEASES_HTML_URL}
              target='_blank'
              rel='noopener noreferrer'
              className={legalLinkClassName}
            >
              {DOWNLOAD_COPY.legal.hostLabel}
            </a>
            . {DOWNLOAD_COPY.legal.agree} {APP_NAME}{' '}
            <UiLink asChild variant='inline' className={legalLinkClassName}>
              <Link href={APP_ROUTES.LEGAL_TERMS}>
                {DOWNLOAD_COPY.legal.terms}
              </Link>
            </UiLink>{' '}
            {DOWNLOAD_COPY.legal.and}{' '}
            <UiLink asChild variant='inline' className={legalLinkClassName}>
              <Link href={APP_ROUTES.LEGAL_PRIVACY}>
                {DOWNLOAD_COPY.legal.privacy}
              </Link>
            </UiLink>
            .
          </p>
        </MarketingContainer>
      </div>
    </>
  );
}

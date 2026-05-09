import { ArrowDownToLine } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  FaqSection,
  MarketingContainer,
  MarketingHero,
} from '@/components/marketing';
import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { buildBreadcrumbSchema, buildFaqSchema } from '@/lib/constants/schemas';
import {
  DESKTOP_RELEASES_HTML_URL,
  fetchLatestDesktopRelease,
} from '@/lib/desktop/github-releases';

export const revalidate = false;

const DOWNLOAD_URL = '/api/desktop/download';

const FAQ_ITEMS = [
  {
    question: 'Is the Mac app safe?',
    answer: `Yes. Every release is code-signed with our Apple Developer ID and notarized by Apple before it's published. macOS Gatekeeper verifies both signatures the first time you launch the app.`,
  },
  {
    question: 'Will the app update itself?',
    answer:
      'Yes. Once installed, Jovie checks for new versions on launch and downloads them in the background. You never have to come back to this page after the first install.',
  },
  {
    question: 'Why is there only a Mac version right now?',
    answer:
      "Mac is where most of our early users work. Windows and Linux builds aren't ready yet — when they are, they'll show up on this page automatically.",
  },
  {
    question: 'Does the app work on Apple Silicon and Intel Macs?',
    answer:
      'Yes. We ship a single universal binary that runs natively on both Apple Silicon (M-series) and Intel Macs.',
  },
  {
    question: 'Where does the download come from?',
    answer:
      'Releases are hosted on GitHub. The download button on this page redirects to the latest signed DMG attached to our public GitHub release.',
  },
];

export const metadata: Metadata = {
  title: 'Download Jovie for Mac',
  description: `Download the ${APP_NAME} desktop app for macOS. Code-signed, notarized by Apple, and updates itself in the background.`,
  alternates: {
    canonical: `${BASE_URL}/download`,
  },
  openGraph: {
    title: `Download ${APP_NAME} for Mac`,
    description: `${APP_NAME} for macOS — signed, notarized, auto-updating.`,
    url: `${BASE_URL}/download`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Download ${APP_NAME} for Mac`,
    description: `${APP_NAME} for macOS — signed, notarized, auto-updating.`,
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
  const meta = [versionLabel, sizeLabel, 'Universal']
    .filter((value): value is string => Boolean(value))
    .join(' · ');

  return (
    <>
      <script type='application/ld+json'>{FAQ_SCHEMA}</script>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>

      <MarketingHero variant='centered'>
        <h1 className='marketing-h1-linear max-w-[18ch] text-primary-token'>
          Jovie for Mac.
        </h1>
        <p className='mt-6 max-w-[52ch] text-lg leading-relaxed text-secondary-token'>
          A native desktop app for your release work. Signed by Apple,
          notarized, and updates itself in the background.
        </p>
        <div className='mt-10 flex flex-col items-center gap-3'>
          <a
            href={DOWNLOAD_URL}
            className='inline-flex items-center gap-3 rounded-full bg-white px-7 py-3.5 text-base font-medium text-black transition-colors hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
            data-analytics-event='download_mac_dmg'
            data-analytics-source='download_page_hero'
          >
            <ArrowDownToLine className='size-5' aria-hidden='true' />
            Download for Mac
          </a>
          {meta ? <p className='text-sm text-tertiary-token'>{meta}</p> : null}
        </div>
      </MarketingHero>

      <MarketingContainer width='prose' className='pb-20'>
        <section>
          <h2 className='marketing-h2-linear text-primary-token'>
            What you get.
          </h2>
          <div className='mt-8 grid gap-8 sm:grid-cols-2'>
            {[
              {
                title: 'Native macOS shell',
                description:
                  'A real Mac window with proper menus, keyboard shortcuts, and Dock integration. The web app, faster.',
              },
              {
                title: 'Background updates',
                description:
                  'New versions install on quit. You launch and you have the latest build — no prompts, no manual reinstall.',
              },
              {
                title: 'Apple-signed and notarized',
                description:
                  'Each release is code-signed with our Developer ID and submitted to Apple for notarization. Gatekeeper trusts it on first launch.',
              },
              {
                title: 'Universal binary',
                description:
                  'One download for both Apple Silicon and Intel. The right architecture is selected automatically.',
              },
            ].map(feature => (
              <div key={feature.title}>
                <h3 className='font-medium text-primary-token'>
                  {feature.title}
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-secondary-token'>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </MarketingContainer>

      <MarketingContainer width='prose' className='pb-20'>
        <section>
          <h2 className='marketing-h2-linear text-primary-token'>
            System requirements.
          </h2>
          <dl className='mt-8 grid gap-x-10 gap-y-4 text-sm sm:grid-cols-[max-content_1fr]'>
            {[
              { label: 'Operating system', value: 'macOS 11 Big Sur or later' },
              {
                label: 'Architecture',
                value: 'Apple Silicon (M1/M2/M3/M4) or Intel — universal',
              },
              { label: 'Memory', value: '4 GB RAM minimum, 8 GB recommended' },
              { label: 'Disk space', value: '500 MB free' },
              { label: 'Network', value: 'Internet connection required' },
            ].map(row => (
              <div key={row.label} className='contents text-secondary-token'>
                <dt className='text-tertiary-token'>{row.label}</dt>
                <dd className='text-primary-token'>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </MarketingContainer>

      <FaqSection items={FAQ_ITEMS} heading='Frequently asked questions' />

      <MarketingContainer width='prose' className='pb-20 pt-4'>
        <p className='text-xs text-tertiary-token'>
          Releases are hosted on{' '}
          <a
            href={DESKTOP_RELEASES_HTML_URL}
            target='_blank'
            rel='noopener noreferrer'
            className='underline hover:text-secondary-token'
          >
            GitHub
          </a>
          . By downloading the app you agree to the {APP_NAME}{' '}
          <Link
            href={APP_ROUTES.LEGAL_TERMS}
            className='underline hover:text-secondary-token'
          >
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link
            href={APP_ROUTES.LEGAL_PRIVACY}
            className='underline hover:text-secondary-token'
          >
            Privacy Policy
          </Link>
          . © {new Date().getFullYear()} {LEGAL_ENTITY_NAME}.
        </p>
      </MarketingContainer>
    </>
  );
}

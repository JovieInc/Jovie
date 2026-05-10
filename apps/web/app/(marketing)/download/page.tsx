import { ArrowDownToLine } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  FaqSection,
  MarketingContainer,
  MarketingFeatureGrid,
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
    question: 'Why is there only a Mac version?',
    answer:
      'Most early Jovie users work on Mac. Windows and Linux versions will come later when they are ready.',
  },
  {
    question: 'Where does the download come from?',
    answer:
      'The download button redirects to the latest signed Jovie release hosted on GitHub.',
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
  const meta = [versionLabel, sizeLabel, 'Apple Silicon + Intel']
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
          Run your Jovie workspace from a native Mac app. Manage releases,
          links, fan data, and campaigns without living in another browser tab.
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
          <p className='text-xs text-tertiary-token'>
            Developer ID signed · Apple notarized · Auto-updates included
          </p>
        </div>
      </MarketingHero>

      <MarketingContainer width='prose' className='pb-20'>
        <section>
          <h2 className='marketing-h2-linear text-primary-token'>
            Everything in Jovie, built for your desktop.
          </h2>
          <MarketingFeatureGrid
            items={[
              {
                title: 'Native Mac experience',
                description:
                  'Open Jovie from your Dock, switch with keyboard shortcuts, and keep your release workflow separate from browser noise.',
              },
              {
                title: 'Faster daily workflow',
                description:
                  'Launch directly into your workspace and move through releases, links, fans, and campaigns with less friction.',
              },
              {
                title: 'Automatic updates',
                description:
                  'New versions install automatically when you quit the app, so you stay current without downloading the installer again.',
              },
              {
                title: 'Trusted Mac install',
                description:
                  'Each release is signed with our Apple Developer ID and notarized by Apple before it ships.',
              },
              {
                title: 'One download for every Mac',
                description:
                  'The same installer works on Apple Silicon and Intel Macs.',
              },
              {
                title: 'Connected to your Jovie account',
                description:
                  'Sign in once and keep working with the same workspace, data, and permissions you use on the web.',
              },
            ]}
          />
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
                value: 'Apple Silicon or Intel Mac',
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

      <MarketingContainer width='prose' className='pb-20'>
        <section className='flex flex-col items-center text-center'>
          <h2 className='marketing-h2-linear text-primary-token'>
            Ready to work from your desktop?
          </h2>
          <p className='mt-6 max-w-[52ch] text-lg leading-relaxed text-secondary-token'>
            Download Jovie for Mac and keep your release workflow one click
            away.
          </p>
          <a
            href={DOWNLOAD_URL}
            className='mt-10 inline-flex items-center gap-3 rounded-full bg-white px-7 py-3.5 text-base font-medium text-black transition-colors hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
            data-analytics-event='download_mac_dmg'
            data-analytics-source='download_page_footer'
          >
            <ArrowDownToLine className='size-5' aria-hidden='true' />
            Download for Mac
          </a>
        </section>
      </MarketingContainer>

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

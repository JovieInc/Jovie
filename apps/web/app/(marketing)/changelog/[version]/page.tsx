import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Calendar,
  Check,
  ChevronRight,
  FileCode2,
  ListChecks,
  Rss,
  Terminal,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { ChangelogTimeline } from '@/components/marketing/changelog/ChangelogTimeline';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { changelogInlineText } from '@/lib/changelog-parser';
import { getChangelogReleases } from '@/lib/changelog-source';
import '../changelog-editorial.css';

export const revalidate = false;

type ChangelogReleasePageProps = {
  readonly params: Promise<{ readonly version: string }>;
};

export async function generateStaticParams() {
  const releases = await getChangelogReleases();
  return releases.map(release => ({ version: release.version }));
}

export async function generateMetadata({
  params,
}: ChangelogReleasePageProps): Promise<Metadata> {
  const { version } = await params;
  const releases = await getChangelogReleases();
  const release = releases.find(candidate => candidate.version === version);
  if (!release) return {};

  const canonical = `${BASE_URL}/changelog/${encodeURIComponent(version)}`;
  const description = release.summary
    ? changelogInlineText(release.summary)
    : `Features, improvements, and fixes in ${APP_NAME} v${version}.`;
  return {
    title: `${APP_NAME} v${version}`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${APP_NAME} v${version}`,
      description,
      type: 'article',
      url: canonical,
      publishedTime: release.date ? `${release.date}T00:00:00Z` : undefined,
    },
  };
}

/** "28 Aug 2026" — the pen meta-row date format (day-first, UTC-stable). */
function formatShipDate(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}

const RESOURCE_LINKS: readonly {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly href: string;
  readonly sub: string;
}[] = [
  {
    icon: Rss,
    label: 'RSS Feed',
    href: `${APP_ROUTES.CHANGELOG}/feed.xml`,
    sub: '/changelog/feed.xml',
  },
  {
    icon: Braces,
    label: 'JSON Feed',
    href: `${APP_ROUTES.CHANGELOG}/feed.json`,
    sub: '/changelog/feed.json',
  },
  {
    icon: Terminal,
    label: 'Developers',
    href: APP_ROUTES.DEVELOPERS,
    sub: 'Public artist API',
  },
  {
    icon: FileCode2,
    // ui-casing-allow: OpenAPI is the canonical API name
    label: 'OpenAPI Contract',
    href: '/openapi.json',
    sub: '/openapi.json',
  },
];

export default async function ChangelogReleasePage({
  params,
}: ChangelogReleasePageProps) {
  const { version } = await params;
  const releases = await getChangelogReleases();
  const releaseIndex = releases.findIndex(
    candidate => candidate.version === version
  );
  const release = releaseIndex === -1 ? undefined : releases[releaseIndex];
  if (!release) notFound();

  const isLatest = releaseIndex === 0;
  const olderRelease = releases[releaseIndex + 1];
  const newerRelease =
    releaseIndex > 0 ? releases[releaseIndex - 1] : undefined;
  const hasRemovals = release.sections.removed.length > 0;
  const updateCount = Object.values(release.sections).reduce(
    (total, entries) => total + entries.length,
    0
  );

  return (
    <section className='min-h-screen bg-base text-primary-token'>
      <div className='relative'>
        <div
          aria-hidden='true'
          className='hero-glow pointer-events-none absolute inset-0'
        />
        <MarketingHero variant='left'>
          <nav aria-label='Breadcrumb'>
            <ol className='flex flex-wrap items-center gap-2.5 font-mono text-app'>
              <li>
                <Link
                  href={APP_ROUTES.CHANGELOG}
                  className='text-quaternary-token transition-colors duration-subtle hover:text-secondary-token'
                >
                  /changelog
                </Link>
              </li>
              <li aria-hidden='true'>
                <ChevronRight className='size-3 text-quaternary-token' />
              </li>
              <li aria-current='page' className='text-accent'>
                {/* ui-casing-allow: semantic version path segment */}/v
                {release.version}
              </li>
            </ol>
          </nav>

          <div className='mt-8 flex flex-wrap items-center gap-5'>
            <h1 className='changelog-version-identity font-mono text-primary-token'>
              {/* ui-casing-allow: semantic version string */}v{release.version}
            </h1>
            <div className='flex flex-col items-start gap-2.5'>
              {isLatest && (
                <span className='rounded-full bg-success-subtle px-3.5 py-1 font-mono text-app font-semibold tracking-wide text-success'>
                  Current
                </span>
              )}
              {!hasRemovals && (
                <span className='rounded-full border border-strong px-3.5 py-1 font-mono text-app font-medium tracking-wide text-secondary-token'>
                  No breaking changes
                </span>
              )}
            </div>
          </div>

          {release.summary && (
            <p className='changelog-release-title mt-6 max-w-3xl text-balance text-primary-token'>
              {changelogInlineText(release.summary)}
            </p>
          )}

          <div className='mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs text-quaternary-token'>
            {release.date && (
              <span className='flex items-center gap-2'>
                <Calendar aria-hidden='true' className='size-3.5' />
                Shipped {formatShipDate(release.date)}
              </span>
            )}
            <span className='flex items-center gap-2'>
              <ListChecks aria-hidden='true' className='size-3.5' />
              {updateCount} update{updateCount === 1 ? '' : 's'}
            </span>
          </div>
        </MarketingHero>
      </div>

      <MarketingContainer width='page' className='pb-20 sm:pb-28'>
        <div className='border-t border-subtle pt-14'>
          <ChangelogTimeline releases={[release]} showEntryHeader={false} />
        </div>

        <section aria-labelledby='release-resources' className='mt-6'>
          <h2
            id='release-resources'
            className='changelog-resources-heading tracking-tight text-primary-token'
          >
            {/* ui-casing-allow: founder-locked pen copy (iekBP) */}
            Resources for this release
          </h2>
          <ul className='mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4'>
            {RESOURCE_LINKS.map(resource => (
              <li key={resource.href}>
                <Link
                  href={resource.href}
                  className='group flex h-full flex-col gap-3.5 rounded-xl border border-subtle bg-surface-0 p-6 transition-colors duration-subtle hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                >
                  <span className='flex items-center justify-between'>
                    <resource.icon
                      aria-hidden='true'
                      className='size-4.5 text-accent'
                    />
                    <ArrowUpRight
                      aria-hidden='true'
                      className='size-3.5 text-quaternary-token transition-colors duration-subtle group-hover:text-secondary-token'
                    />
                  </span>
                  <span className='text-base font-semibold text-primary-token'>
                    {resource.label}
                  </span>
                  <span className='font-mono text-2xs leading-normal text-quaternary-token'>
                    {resource.sub}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <nav
          // ui-casing-allow: aria label, not visible UI copy
          aria-label='Release navigation'
          className='mt-18 grid gap-5 sm:grid-cols-2'
        >
          <div className='border-t border-subtle pt-6'>
            <p className='flex items-center gap-2 font-mono text-2xs font-medium tracking-widest text-quaternary-token'>
              <ArrowLeft aria-hidden='true' className='size-3.5' />
              {/* ui-casing-allow: founder-locked pen copy (iekBP) */}Previous
              release
            </p>
            {olderRelease ? (
              <>
                <Link
                  href={`/changelog/${encodeURIComponent(olderRelease.version)}`}
                  className='mt-2 inline-block font-mono text-sm font-medium text-accent underline-offset-4 transition-colors duration-subtle hover:underline'
                >
                  {/* ui-casing-allow: semantic version string */}v
                  {olderRelease.version}
                </Link>
                {olderRelease.date && (
                  <p className='mt-2 text-xs text-quaternary-token'>
                    {formatShipDate(olderRelease.date)}
                  </p>
                )}
              </>
            ) : (
              <p className='mt-2 text-xs text-quaternary-token'>
                This is the earliest public release.
              </p>
            )}
          </div>

          <div className='border-t border-subtle pt-6'>
            {newerRelease ? (
              <>
                <p className='flex items-center gap-2 font-mono text-2xs font-medium tracking-widest text-quaternary-token'>
                  {/* ui-casing-allow: founder-locked pen copy (iekBP) */}Next
                  release
                </p>
                <Link
                  href={`/changelog/${encodeURIComponent(newerRelease.version)}`}
                  className='mt-2 inline-block font-mono text-sm font-medium text-accent underline-offset-4 transition-colors duration-subtle hover:underline'
                >
                  {/* ui-casing-allow: semantic version string */}v
                  {newerRelease.version}
                </Link>
                {newerRelease.date && (
                  <p className='mt-2 text-xs text-quaternary-token'>
                    {formatShipDate(newerRelease.date)}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className='flex items-center gap-2 font-mono text-2xs font-medium tracking-widest text-quaternary-token'>
                  {/* ui-casing-allow: founder-locked pen copy (iekBP) */}You
                  are on the latest
                  <Check aria-hidden='true' className='size-3.5 text-success' />
                </p>
                <Link
                  href={APP_ROUTES.CHANGELOG}
                  className='mt-2 inline-flex items-center gap-2 font-mono text-sm font-medium text-accent underline-offset-4 transition-colors duration-subtle hover:underline'
                >
                  {/* ui-casing-allow: founder-locked pen copy (iekBP) */}All
                  releases
                  <ArrowRight aria-hidden='true' className='size-3.5' />
                </Link>
              </>
            )}
          </div>
        </nav>
      </MarketingContainer>
    </section>
  );
}

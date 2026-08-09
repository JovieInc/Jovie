import fs from 'node:fs';
import { Badge } from '@jovie/ui/atoms/badge';
import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { ChangelogTimeline } from '@/components/marketing/changelog/ChangelogTimeline';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { type ChangelogRelease, parseChangelog } from '@/lib/changelog-parser';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';
import { ChangelogEmailSignup } from './ChangelogEmailSignup';

// ---------------------------------------------------------------------------
// File resolution & caching
// ---------------------------------------------------------------------------

function resolveChangelogPath(): string | null {
  const changelogPath = resolveMonorepoPath('CHANGELOG.md');
  return fs.existsSync(changelogPath) ? changelogPath : null;
}

export const revalidate = false;

const getReleases = unstable_cache(
  async (): Promise<ChangelogRelease[]> => {
    const changelogPath = resolveChangelogPath();
    if (!changelogPath) return [];
    try {
      const md = fs.readFileSync(changelogPath, 'utf8');
      return parseChangelog(md);
    } catch {
      return [];
    }
  },
  ['changelog-releases'],
  { revalidate: false, tags: ['changelog'] }
);

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "What's New",
  description: `Product updates and improvements to ${APP_NAME}. See what we've been shipping.`,
  alternates: {
    canonical: `${BASE_URL}/changelog`,
    types: { 'application/atom+xml': `${BASE_URL}/changelog/feed.xml` },
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ChangelogPage() {
  const releases = await getReleases();

  // Count releases in current month for velocity counter
  const now = new Date();
  const currentMonthPrefix = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const thisMonthCount = releases.filter(r =>
    r.date.startsWith(currentMonthPrefix)
  ).length;

  return (
    <section className='min-h-screen bg-page text-primary-token'>
      {/* Header */}
      <MarketingHero variant='left'>
        <p className='text-sm font-medium text-tertiary-token'>Changelog</p>
        <h1 className='mb-4 mt-6 max-w-xs text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl'>
          What&apos;s New
        </h1>
        <p className='mb-4 max-w-xl text-lg leading-relaxed text-secondary-token'>
          Follow our journey building the future of music.
        </p>
        <div className='flex flex-wrap items-center gap-3'>
          {thisMonthCount > 0 && (
            <Badge variant='outline' className='text-xs'>
              {thisMonthCount} Update{thisMonthCount === 1 ? '' : 's'} This
              Month
            </Badge>
          )}
          <Link
            href='/changelog/feed.xml'
            className='text-xs text-secondary-token transition-colors hover:text-primary-token'
          >
            RSS Feed
          </Link>
        </div>
      </MarketingHero>

      {/* Releases timeline */}
      <MarketingContainer width='page' className='pb-20 sm:pb-28'>
        <div className='marketing-divider mb-10' />
        <ChangelogTimeline releases={releases} />

        {/* Email signup */}
        <div className='mt-16 max-w-xl'>
          <ChangelogEmailSignup />
        </div>
      </MarketingContainer>
    </section>
  );
}

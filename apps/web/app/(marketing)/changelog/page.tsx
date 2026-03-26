import fs from 'node:fs';
import path from 'node:path';
import { Badge } from '@jovie/ui/atoms/badge';
import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import {
  type ChangelogRelease,
  type ChangelogSection,
  parseChangelog,
} from '@/lib/changelog-parser';
import { ChangelogEmailSignup } from './ChangelogEmailSignup';

// ---------------------------------------------------------------------------
// File resolution & caching
// ---------------------------------------------------------------------------

const CHANGELOG_CANDIDATE_PATHS = [
  path.join(process.cwd(), 'CHANGELOG.md'),
  path.join(process.cwd(), '..', '..', 'CHANGELOG.md'),
];

function resolveChangelogPath(): string | null {
  for (const candidate of CHANGELOG_CANDIDATE_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
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
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}

const SECTION_LABELS: Record<
  keyof ChangelogSection,
  { label: string; color: string }
> = {
  added: {
    label: 'New',
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  changed: {
    label: 'Improved',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  fixed: {
    label: 'Fixed',
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  removed: {
    label: 'Removed',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400',
  },
};

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
        <p className='marketing-kicker'>Changelog</p>
        <h1 className='marketing-h1-linear mb-4 mt-6 max-w-[10ch]'>
          What&apos;s new
        </h1>
        <p
          className='marketing-lead-linear mb-4 max-w-[34rem]'
          style={{ color: 'var(--linear-text-secondary)' }}
        >
          Follow our journey building the future of music.
        </p>
        <div className='flex flex-wrap items-center gap-3'>
          {thisMonthCount > 0 && (
            <Badge variant='outline' className='text-xs'>
              {thisMonthCount} update{thisMonthCount === 1 ? '' : 's'} this
              month
            </Badge>
          )}
          <Link
            href='/changelog/feed.xml'
            className='text-xs opacity-40 hover:opacity-70 transition-opacity'
          >
            RSS Feed
          </Link>
        </div>
      </MarketingHero>

      {/* Releases timeline */}
      <MarketingContainer width='page' className='pb-20 sm:pb-28'>
        <div className='marketing-divider mb-10' />
        <div className='max-w-3xl'>
          {releases.length === 0 ? (
            <p className='opacity-40'>No updates yet. Check back soon!</p>
          ) : (
            <div className='space-y-10'>
              {releases.map(release => (
                <article
                  key={`${release.version}-${release.date ?? 'unreleased'}`}
                  className='relative pl-6 border-l-2'
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--linear-text-primary) 10%, transparent)',
                  }}
                >
                  {/* Timeline dot */}
                  <div
                    className='absolute -left-[7px] top-1 w-3 h-3 rounded-full'
                    style={{
                      backgroundColor: 'var(--linear-text-primary)',
                      opacity: 0.3,
                    }}
                  />

                  {/* Version + date header */}
                  <div className='flex flex-wrap items-center gap-2 mb-4'>
                    <Badge variant='outline' className='font-mono text-xs'>
                      v{release.version}
                    </Badge>
                    {release.date && (
                      <span className='text-xs opacity-40'>
                        {formatDate(release.date)}
                      </span>
                    )}
                  </div>

                  {/* Summary */}
                  {release.summary && (
                    <p className='text-sm leading-relaxed opacity-60 mb-4'>
                      {release.summary}
                    </p>
                  )}

                  {/* Sections */}
                  <div className='space-y-4'>
                    {(
                      Object.entries(SECTION_LABELS) as [
                        keyof ChangelogSection,
                        { label: string; color: string },
                      ][]
                    ).map(([key, meta]) => {
                      const entries = release.sections[key];
                      if (!entries || entries.length === 0) return null;
                      const seenEntryKeys = new Map<string, number>();
                      return (
                        <div key={key}>
                          <span
                            className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mb-2 ${meta.color}`}
                          >
                            {meta.label}
                          </span>
                          <ul className='space-y-1.5'>
                            {entries.map(entry => {
                              const entryBaseKey = `${release.version}-${key}-${entry}`;
                              const seenCount =
                                seenEntryKeys.get(entryBaseKey) ?? 0;
                              seenEntryKeys.set(entryBaseKey, seenCount + 1);

                              return (
                                <li
                                  key={
                                    seenCount === 0
                                      ? entryBaseKey
                                      : `${entryBaseKey}-${seenCount + 1}`
                                  }
                                  className='text-sm leading-relaxed opacity-75'
                                >
                                  {entry}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {/* Email signup */}
        <div className='mt-16 max-w-xl'>
          <ChangelogEmailSignup />
        </div>
      </MarketingContainer>
    </section>
  );
}

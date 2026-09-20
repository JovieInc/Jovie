import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing';
import { ChangelogSubscribeColumn } from '@/components/marketing/changelog/ChangelogSubscribeColumn';
import { CustomerChangelogArchive } from '@/components/marketing/changelog/CustomerChangelogArchive';
import { MarketingFinalCTA } from '@/components/site/MarketingFinalCTA';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { getChangelogReleases } from '@/lib/changelog-source';
import {
  type CustomerChangelogEntry,
  groupCustomerChangelogByMonth,
  projectCustomerChangelog,
} from '@/lib/customer-changelog';
import './changelog-editorial.css';

export const revalidate = false;

export const metadata: Metadata = {
  title: "What's new in Jovie",
  description: `Audience and control updates in ${APP_NAME}. What got better for you — not every deploy.`,
  alternates: {
    canonical: `${BASE_URL}${APP_ROUTES.CHANGELOG}`,
    types: {
      'application/atom+xml': `${BASE_URL}${APP_ROUTES.CHANGELOG}/feed.xml`,
      'application/feed+json': `${BASE_URL}${APP_ROUTES.CHANGELOG}/feed.json`,
    },
  },
};

/** Hero timeline tone order by recency rank (pen bBTae: ion, pulse, mint). */
const TIMELINE_TONES = ['ion', 'pulse', 'mint'] as const;

function formatTimelineDate(iso: string): string {
  if (!iso) return '';
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed
    .toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
    .toUpperCase();
}

function ReleaseJournalHero({
  latest,
}: {
  readonly latest: readonly CustomerChangelogEntry[];
}) {
  return (
    <section className='changelog-hero' aria-labelledby='changelog-hero-title'>
      <MarketingContainer width='page' className='changelog-hero__inner'>
        <div className='changelog-hero__masthead'>
          <p className='changelog-hero__kicker'>Changelog</p>
          <h1
            id='changelog-hero-title'
            className='changelog-hero__title line-clamp-2'
          >
            {/* eslint-disable-next-line @jovie/canonical-ui-label-casing -- pen editorial headline casing */}
            {'What shipped.'}
          </h1>
          <p className='changelog-hero__support'>
            Versioned, dated, and source-backed.
          </p>
        </div>

        {latest.length > 0 ? (
          <div className='changelog-hero__timeline'>
            <ol className='changelog-hero__timeline-entries'>
              {latest.map((entry, index) => (
                <li key={entry.slug}>
                  <Link
                    href={`#${entry.slug}`}
                    className='changelog-hero__timeline-link'
                  >
                    <span
                      aria-hidden='true'
                      className={`changelog-hero__tone-dot changelog-hero__tone-dot--${TIMELINE_TONES[index % TIMELINE_TONES.length]}`}
                    />
                    <span className='changelog-hero__timeline-date'>
                      {formatTimelineDate(entry.date)}
                    </span>
                    <span className='changelog-hero__timeline-title'>
                      {entry.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </MarketingContainer>
    </section>
  );
}

export default async function ChangelogPage() {
  const releases = await getChangelogReleases();
  const months = groupCustomerChangelogByMonth(
    projectCustomerChangelog(releases)
  );
  const latest = months.flatMap(group => group.entries).slice(0, 3);

  return (
    <div className='min-h-screen bg-page text-primary-token'>
      <ReleaseJournalHero latest={latest} />

      <section aria-labelledby='changelog-archive-title'>
        <MarketingContainer width='page' className='changelog-lead'>
          <div className='changelog-lead__grid'>
            <div className='changelog-lead__copy'>
              <p className='changelog-lead__eyebrow'>Changelog</p>
              <h2
                id='changelog-archive-title'
                className='changelog-lead__title line-clamp-2'
              >
                {/* eslint-disable-next-line @jovie/canonical-ui-label-casing -- pen editorial title casing */}
                {"What's new in Jovie"}
              </h2>
              <p className='changelog-lead__intro'>
                {
                  'Audience and control updates that change what you can do. Not a log of every deploy.'
                }
              </p>
            </div>
            <ChangelogSubscribeColumn />
          </div>
        </MarketingContainer>
      </section>

      <MarketingContainer width='page' className='changelog-entries'>
        <CustomerChangelogArchive months={months} />
      </MarketingContainer>

      <MarketingFinalCTA
        title='Take control of your presence.'
        ctaLabel='Find your profile'
        ctaHref='/#handle-input'
      />
    </div>
  );
}

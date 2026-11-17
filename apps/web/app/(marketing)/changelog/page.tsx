import type { Metadata } from 'next';
import { MarketingContainer } from '@/components/marketing';
import { ChangelogSubscribeColumn } from '@/components/marketing/changelog/ChangelogSubscribeColumn';
import { CustomerChangelogArchive } from '@/components/marketing/changelog/CustomerChangelogArchive';
import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { getChangelogSnapshot } from '@/lib/changelog-source';
import { jsonLd } from '@/lib/constants/schemas';
import {
  customerChangelogEntryPath,
  groupCustomerChangelogByMonth,
  projectCustomerChangelogArchive,
} from '@/lib/customer-changelog';
import { documentTitle } from '@/lib/seo/document-title';
import './changelog-day-row.css';
import './changelog-editorial.css';

const CHANGELOG_URL = `${BASE_URL}${APP_ROUTES.CHANGELOG}`;

export const revalidate = false;

export const metadata: Metadata = {
  title: documentTitle('Changelog: product updates and new features'),
  description: `New features, improvements and fixes in ${APP_NAME}.`,
  alternates: {
    canonical: CHANGELOG_URL,
    types: {
      'application/atom+xml': `${BASE_URL}${APP_ROUTES.CHANGELOG}/feed.xml`,
      'application/rss+xml': `${BASE_URL}${APP_ROUTES.CHANGELOG}/rss.xml`,
      'application/feed+json': `${BASE_URL}${APP_ROUTES.CHANGELOG}/feed.json`,
    },
  },
};

export default async function ChangelogPage() {
  const snapshot = await getChangelogSnapshot();
  const projection = projectCustomerChangelogArchive(snapshot.sourceReleases);
  const months = groupCustomerChangelogByMonth(projection.entries);

  // The same posts the page renders, for answer engines: headline, date and
  // permalink per update.
  const changelogSchema = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${APP_NAME} changelog`,
    description: `New features, improvements and fixes in ${APP_NAME}.`,
    url: CHANGELOG_URL,
    blogPost: projection.entries.map(entry => ({
      '@type': 'BlogPosting',
      headline: entry.title,
      ...(entry.date ? { datePublished: entry.date } : {}),
      url: `${BASE_URL}${customerChangelogEntryPath(entry)}`,
    })),
  });

  return (
    <div className='min-h-screen bg-page text-primary-token'>
      <script type='application/ld+json'>{changelogSchema}</script>
      <MarketingContainer width='page'>
        <header className='changelog-header'>
          <div className='changelog-header__copy'>
            <h1 className='marketing-type-display line-clamp-2 text-primary-token'>
              Changelog
            </h1>
            <p className='marketing-type-lede changelog-header__lede'>
              {`New features, improvements and fixes in ${APP_NAME}.`}
            </p>
          </div>
          <ChangelogSubscribeColumn />
        </header>

        <CustomerChangelogArchive
          months={months}
          tombstones={projection.tombstones}
          technicalReleases={snapshot.releases.map(({ version, date }) => ({
            version,
            date,
          }))}
        />
      </MarketingContainer>

      {/* Defaults to the shared claim-profile intent, as the site header does. */}
      <MarketingFooterCta />
    </div>
  );
}

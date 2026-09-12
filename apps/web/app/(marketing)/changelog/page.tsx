import { Badge } from '@jovie/ui/atoms/badge';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { CustomerChangelogArchive } from '@/components/marketing/changelog/CustomerChangelogArchive';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { getChangelogReleases } from '@/lib/changelog-source';
import {
  groupCustomerChangelogByMonth,
  projectCustomerChangelog,
} from '@/lib/customer-changelog';
import { ChangelogEmailSignup } from './ChangelogEmailSignup';

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

export default async function ChangelogPage() {
  const releases = await getChangelogReleases();
  const months = groupCustomerChangelogByMonth(
    projectCustomerChangelog(releases)
  );

  const now = new Date();
  const currentMonthPrefix = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const thisMonthCount = months
    .filter(group => group.monthKey === currentMonthPrefix)
    .reduce((total, group) => total + group.entries.length, 0);

  return (
    <section className='min-h-screen bg-page text-primary-token'>
      <MarketingHero variant='left'>
        <p className='text-sm font-medium text-tertiary-token'>Changelog</p>
        {/* eslint-disable-next-line @jovie/canonical-ui-label-casing -- sentence-case marketing heading */}
        <h1 className='system-b-marketing-route-title mb-4 mt-6 max-w-2xl text-primary-token line-clamp-2'>
          What&apos;s new in Jovie
        </h1>
        <p className='mb-4 max-w-xl text-lg leading-relaxed text-secondary-token'>
          Audience and control updates that change what you can do. Not a log of
          every deploy.
        </p>
        <div className='flex flex-wrap items-center gap-3'>
          {thisMonthCount > 0 && (
            <Badge variant='outline' className='text-xs'>
              {thisMonthCount} Update{thisMonthCount === 1 ? '' : 's'} This
              Month
            </Badge>
          )}
          <Link
            href={`${APP_ROUTES.CHANGELOG}/feed.xml`}
            className='text-xs text-secondary-token transition-colors hover:text-primary-token'
          >
            RSS Feed
          </Link>
          <Link
            href={`${APP_ROUTES.CHANGELOG}/feed.json`}
            className='text-xs text-secondary-token transition-colors hover:text-primary-token'
          >
            JSON Feed
          </Link>
        </div>
      </MarketingHero>

      <MarketingContainer width='page' className='pb-20 sm:pb-28'>
        <div className='marketing-divider mb-10' />
        <CustomerChangelogArchive months={months} />

        <div className='mt-16 max-w-xl'>
          <ChangelogEmailSignup />
        </div>
      </MarketingContainer>
    </section>
  );
}

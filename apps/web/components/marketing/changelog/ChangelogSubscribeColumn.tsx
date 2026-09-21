import Link from 'next/link';
import { ChangelogEmailSignup } from '@/app/(marketing)/changelog/ChangelogEmailSignup';
import { APP_ROUTES } from '@/constants/routes';

/**
 * Changelog-scoped subscribe column (pen o5CeaF, YgxYz review).
 *
 * Composes the canonical ChangelogEmailSignup unchanged (it is also the
 * site-wide marketing capture via MarketingEmailSignup) and adds the
 * feed alternatives row: RSS/JSON links at 44px hit targets in quiet ink.
 */
export function ChangelogSubscribeColumn() {
  return (
    <div className='changelog-subscribe'>
      <ChangelogEmailSignup source='changelog_page' />
      <div className='changelog-subscribe__alternatives'>
        <Link
          href={`${APP_ROUTES.CHANGELOG}/feed.xml`}
          className='changelog-subscribe__alt'
        >
          RSS Feed
        </Link>
        <Link
          href={`${APP_ROUTES.CHANGELOG}/feed.json`}
          className='changelog-subscribe__alt'
        >
          JSON Feed
        </Link>
      </div>
    </div>
  );
}

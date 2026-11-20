import { ChangelogEmailSignup } from '@/app/(marketing)/changelog/ChangelogEmailSignup';

/**
 * Changelog subscribe module for the page header.
 *
 * Composes the canonical ChangelogEmailSignup (it is also the site-wide
 * marketing capture via MarketingEmailSignup), set flush left beside the
 * page title. The RSS alternative sits on the feed's filter row.
 */
export function ChangelogSubscribeColumn() {
  return (
    <div className='changelog-subscribe'>
      <ChangelogEmailSignup
        source='changelog_page'
        deferSecurityCheck
        align='start'
      />
    </div>
  );
}

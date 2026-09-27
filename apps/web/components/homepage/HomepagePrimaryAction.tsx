// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import { Button } from '@jovie/ui/atoms/button';
import {
  HeroSpotifySearch,
  type HeroSpotifySearchProps,
} from '@/components/features/home/HeroSpotifySearch';
import { HOMEPAGE_CERTIFIED_EVENTS } from '@/data/homepageCertifiedOptimization';
import { getHomepageFrontDoorCtaContract } from '@/data/homepageFrontDoorCta';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { HomepageTrackedLink } from './HomepageTrackedLink';

/**
 * Non-editorial placements still follow the waitlist gate. The editorial hero
 * is the locked name search (Search your name → Find me → /start, JOV-5864 /
 * JOV-5085) and must not be replaced by Request access.
 */
export function HomepagePrimaryAction(props: HeroSpotifySearchProps) {
  if (!FEATURE_FLAGS.WAITLIST_ENABLED || props.appearance === 'editorial') {
    return <HeroSpotifySearch {...props} />;
  }

  const { primary } = getHomepageFrontDoorCtaContract(true);
  return (
    <div className='homepage-request-access'>
      <Button asChild variant='primary' size='marketing' className='w-full'>
        <HomepageTrackedLink
          href={primary.href}
          data-testid={props.submitTestId}
          eventName={HOMEPAGE_CERTIFIED_EVENTS.ACCESS_REQUESTED}
          eventProperties={props.submitAnalytics?.properties}
        >
          {primary.label}
        </HomepageTrackedLink>
      </Button>
    </div>
  );
}

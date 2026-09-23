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

/** Both Bloom actions use the same build-time gate; auth still owns access. */
export function HomepagePrimaryAction(props: HeroSpotifySearchProps) {
  if (!FEATURE_FLAGS.WAITLIST_ENABLED) {
    return <HeroSpotifySearch {...props} />;
  }

  const { primary } = getHomepageFrontDoorCtaContract(true);
  return (
    <Button
      asChild
      variant='primary'
      size='marketing'
      className='homepage-request-access'
    >
      <HomepageTrackedLink
        href={primary.href}
        data-testid={props.submitTestId}
        eventName={HOMEPAGE_CERTIFIED_EVENTS.ACCESS_REQUESTED}
        eventProperties={props.submitAnalytics?.properties}
      >
        {primary.label}
      </HomepageTrackedLink>
    </Button>
  );
}

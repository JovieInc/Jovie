// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import {
  HeroSpotifySearch,
  type HeroSpotifySearchProps,
} from '@/components/features/home/HeroSpotifySearch';

/**
 * Certified homepage conversion (JOV-5864 / JOV-5085).
 * WAITLIST_ENABLED still gates other marketing doors. It must not replace
 * this control with Request access or a waitlist-first link.
 */
export function HomepagePrimaryAction(props: HeroSpotifySearchProps) {
  return <HeroSpotifySearch {...props} />;
}

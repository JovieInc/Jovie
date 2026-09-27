// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import {
  HeroSpotifySearch,
  type HeroSpotifySearchProps,
} from '@/components/features/home/HeroSpotifySearch';

/**
 * Locked homepage conversion (JOV-5864 / JOV-5085): "Search your name" →
 * "Find me" hands off to /start. The waitlist flag must not replace this
 * control. Waitlist writes happen only after verified auth.
 */
export function HomepagePrimaryAction(props: HeroSpotifySearchProps) {
  return <HeroSpotifySearch {...props} />;
}

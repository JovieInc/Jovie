// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import {
  HeroSpotifySearch,
  type HeroSpotifySearchProps,
} from '@/components/features/home/HeroSpotifySearch';

/**
 * Locked homepage conversion (JOV-5864 / JOV-5085).
 * Name search ("Search your name" → "Find me") hands off to /start.
 * Waitlist writes stay behind verified auth and must not replace this
 * control while the prelaunch gate is on.
 */
export function HomepagePrimaryAction(props: HeroSpotifySearchProps) {
  return <HeroSpotifySearch {...props} />;
}

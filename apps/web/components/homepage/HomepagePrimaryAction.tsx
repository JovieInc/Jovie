// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import {
  HeroSpotifySearch,
  type HeroSpotifySearchProps,
} from '@/components/features/home/HeroSpotifySearch';

/**
 * Homepage conversion is the name search (JOV-5864 / JOV-5085).
 * Waitlist writes stay behind verified auth; this control does not swap to
 * Request access when the prelaunch gate is on.
 */
export function HomepagePrimaryAction(props: HeroSpotifySearchProps) {
  return <HeroSpotifySearch {...props} />;
}

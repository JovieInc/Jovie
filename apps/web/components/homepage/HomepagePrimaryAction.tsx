// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import {
  HeroSpotifySearch,
  type HeroSpotifySearchProps,
} from '@/components/features/home/HeroSpotifySearch';

/**
 * Locked homepage conversion (JOV-5864 / JOV-5085).
 * The waitlist flag still gates marketing-shell CTAs. It must not replace
 * this control with Request access or Get started. Waitlist writes stay
 * behind verified auth; this search hands off to /start.
 */
export function HomepagePrimaryAction(props: HeroSpotifySearchProps) {
  return <HeroSpotifySearch {...props} />;
}

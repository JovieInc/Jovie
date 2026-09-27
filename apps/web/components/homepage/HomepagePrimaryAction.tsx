// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import {
  HeroSpotifySearch,
  type HeroSpotifySearchProps,
} from '@/components/features/home/HeroSpotifySearch';

/**
 * Certified homepage conversion (JOV-5864 / JOV-5085).
 * The waitlist flag may gate other marketing doors. It must not replace
 * this control with Request access or Get started.
 */
export function HomepagePrimaryAction(props: HeroSpotifySearchProps) {
  return <HeroSpotifySearch {...props} />;
}

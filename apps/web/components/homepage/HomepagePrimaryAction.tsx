// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import {
  HeroSpotifySearch,
  type HeroSpotifySearchProps,
} from '@/components/features/home/HeroSpotifySearch';

/**
 * Certified homepage conversion (JOV-5864 / JOV-5085).
 * The waitlist gate runs after verified auth on /start. It must not replace
 * this name search with Request access, Get started, or a waitlist-first link.
 */
export function HomepagePrimaryAction(props: HeroSpotifySearchProps) {
  return <HeroSpotifySearch {...props} />;
}

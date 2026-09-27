// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import {
  HeroSpotifySearch,
  type HeroSpotifySearchProps,
} from '@/components/features/home/HeroSpotifySearch';

/**
 * Homepage conversion control.
 *
 * JOV-5085 / JOV-5864 lock this to the name search (Search your name →
 * Find me) that hands off to /start. The public waitlist flag must not
 * replace it with Request access.
 */
export function HomepagePrimaryAction(props: HeroSpotifySearchProps) {
  return <HeroSpotifySearch {...props} />;
}

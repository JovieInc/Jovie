// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import {
  HeroSpotifySearch,
  type HeroSpotifySearchProps,
} from '@/components/features/home/HeroSpotifySearch';

/**
 * JOV-5864 / JOV-5085: the homepage conversion is the name search
 * (“Search your name” → “Find me”) and it hands off to /start.
 * The waitlist gate must not replace this control. Waitlist writes
 * stay behind verified auth.
 */
export function HomepagePrimaryAction(props: HeroSpotifySearchProps) {
  return <HeroSpotifySearch {...props} />;
}

// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import {
  HeroSpotifySearch,
  type HeroSpotifySearchProps,
} from '@/components/features/home/HeroSpotifySearch';

/**
 * Homepage conversion is the JOV-5864 name search: Search your name → Find me
 * → /start. JOV-5085 locks that handoff. WAITLIST_ENABLED may still gate the
 * header and other marketing doors; it must not replace this control.
 * The server-side waitlist gate owns routing after /start.
 */
export function HomepagePrimaryAction(props: HeroSpotifySearchProps) {
  return <HeroSpotifySearch {...props} />;
}

// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import {
  HeroSpotifySearch,
  type HeroSpotifySearchProps,
} from '@/components/features/home/HeroSpotifySearch';

/**
 * JOV-5085 / JOV-5864: the homepage conversion is the name search
 * (Search your name → Find me → /start). The public waitlist flag still
 * owns header and other marketing CTAs. It must not replace this control.
 */
export function HomepagePrimaryAction(props: HeroSpotifySearchProps) {
  return <HeroSpotifySearch {...props} />;
}

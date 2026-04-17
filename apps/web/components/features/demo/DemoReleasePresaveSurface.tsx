import { UnreleasedReleaseHero } from '@/features/release/UnreleasedReleaseHero';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { DemoClientProviders } from './DemoClientProviders';

/** Returns a date N days from now so the countdown always looks realistic. */
function futureDate(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

/**
 * Demo surface for a presave/unreleased release state.
 * Uses a rolling 10-day-from-now date so the countdown always looks realistic.
 * Backed by UnreleasedReleaseHero with the founder's profile data.
 */
export function DemoReleasePresaveSurface() {
  return (
    <DemoClientProviders>
      <div data-testid='demo-showcase-release-presave'>
        <UnreleasedReleaseHero
          release={{
            id: 'demo-the-deep-end',
            slug: 'the-deep-end',
            title: 'The Deep End',
            artworkUrl: null,
            releaseDate: futureDate(10),
            trackId: null,
            hasSpotify: true,
            hasAppleMusic: true,
          }}
          artist={{
            id: 'demo-tim-white',
            name: TIM_WHITE_PROFILE.name,
            handle: TIM_WHITE_PROFILE.handle,
            avatarUrl: TIM_WHITE_PROFILE.avatarSrc,
          }}
        />
      </div>
    </DemoClientProviders>
  );
}

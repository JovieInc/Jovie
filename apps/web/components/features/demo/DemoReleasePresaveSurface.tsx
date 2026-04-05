import { UnreleasedReleaseHero } from '@/features/release/UnreleasedReleaseHero';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { DemoClientProviders } from './DemoClientProviders';

/**
 * Demo surface for a presave/unreleased release state.
 * Uses a far-future date (2027-12-31) so the countdown never expires on the homepage.
 * Backed by UnreleasedReleaseHero with canonical Tim White data.
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
            releaseDate: new Date('2027-12-31T00:00:00Z'),
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

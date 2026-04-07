import { UnreleasedReleaseHero } from '@/features/release/UnreleasedReleaseHero';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';
import { DemoClientProviders } from './DemoClientProviders';

/**
 * Demo surface for a presave/unreleased release state.
 * Uses a far-future date so the countdown does not expire in demo/proof surfaces.
 * Backed by UnreleasedReleaseHero with the canonical internal demo DJ data.
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
            releaseDate: new Date('2099-12-31T00:00:00Z'),
            trackId: null,
            hasSpotify: true,
            hasAppleMusic: true,
          }}
          artist={{
            id: 'demo-calvin-harris',
            name: INTERNAL_DJ_DEMO_PERSONA.profile.displayName,
            handle: INTERNAL_DJ_DEMO_PERSONA.profile.handle,
            avatarUrl: INTERNAL_DJ_DEMO_PERSONA.profile.avatarSrc,
          }}
        />
      </div>
    </DemoClientProviders>
  );
}

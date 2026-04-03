import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { DemoClientProviders } from './DemoClientProviders';
import { DEMO_RELEASE_VIEW_MODELS } from './mock-release-data';

const RELEASE = DEMO_RELEASE_VIEW_MODELS[0];

export function DemoReleaseLandingSurface() {
  return (
    <DemoClientProviders>
      <div data-testid='demo-showcase-release-landing'>
        <ReleaseLandingPage
          release={{
            title: RELEASE.title,
            artworkUrl: RELEASE.artworkUrl ?? null,
            releaseDate: RELEASE.releaseDate ?? null,
            previewUrl: RELEASE.previewUrl ?? null,
          }}
          artist={{
            name: TIM_WHITE_PROFILE.name,
            handle: TIM_WHITE_PROFILE.handle,
            avatarUrl: TIM_WHITE_PROFILE.avatarSrc,
          }}
          featuredArtists={[{ name: 'Sora Vale', handle: null }]}
          providers={RELEASE.providers.map(provider => ({
            key: provider.key,
            label: provider.label,
            accent:
              provider.key === 'spotify'
                ? '#1DB954'
                : provider.key === 'apple_music'
                  ? '#FA2D48'
                  : provider.key === 'youtube'
                    ? '#FF0000'
                    : provider.key === 'amazon_music'
                      ? '#00A8E1'
                      : '#5E6AD2',
            url: provider.url,
          }))}
          soundsUrl={`/${TIM_WHITE_PROFILE.handle}/take-me-over/sounds`}
        />
      </div>
    </DemoClientProviders>
  );
}

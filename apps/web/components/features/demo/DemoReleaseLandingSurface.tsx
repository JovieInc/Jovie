'use client';

import { useSearchParams } from 'next/navigation';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { DemoClientProviders } from './DemoClientProviders';
import { DEMO_RELEASE_VIEW_MODELS } from './mock-release-data';

const RELEASE = DEMO_RELEASE_VIEW_MODELS[0];
const PROVIDER_ACCENTS: Record<string, string> = {
  spotify: '#1DB954',
  apple_music: '#FA2D48',
  youtube: '#FF0000',
  amazon_music: '#00A8E1',
};
const DEFAULT_PROVIDER_ACCENT = '#5E6AD2';
const DEMO_CREDITS: readonly SmartLinkCreditGroup[] = [
  {
    role: 'featured_artist',
    label: 'Featured artist',
    entries: [
      {
        artistId: 'credit-feature-1',
        name: 'Clementine Douglas',
        handle: null,
        role: 'featured_artist',
        position: 1,
      },
    ],
  },
  {
    role: 'producer',
    label: 'Producer',
    entries: [
      {
        artistId: 'credit-producer-1',
        name: 'Tim White',
        handle: TIM_WHITE_PROFILE.handle,
        role: 'producer',
        position: 1,
      },
    ],
  },
] as const;

export function DemoReleaseLandingSurface() {
  const searchParams = useSearchParams();
  const captureMode = searchParams.get('capture');

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
          providers={RELEASE.providers.map(provider => ({
            key: provider.key,
            label: provider.label,
            accent: PROVIDER_ACCENTS[provider.key] ?? DEFAULT_PROVIDER_ACCENT,
            url: provider.url,
          }))}
          credits={[...DEMO_CREDITS]}
          soundsUrl={`/${TIM_WHITE_PROFILE.handle}/take-me-over/sounds`}
          initialMenuOpen={captureMode === 'creator-menu'}
        />
      </div>
    </DemoClientProviders>
  );
}

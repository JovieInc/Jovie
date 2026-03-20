'use client';

import {
  primaryProviderKeys,
  providerConfig,
} from '@/app/app/(shell)/dashboard/releases/config';
import { ReleasesExperience } from '@/features/dashboard/organisms/release-provider-matrix';
import {
  DEMO_RELEASE_SIDEBAR_FIXTURES,
  DEMO_RELEASE_VIEW_MODELS,
} from '@/features/demo/mock-release-data';

export function SceneReleasesContent() {
  return (
    <div className='p-4'>
      <ReleasesExperience
        releases={DEMO_RELEASE_VIEW_MODELS}
        providerConfig={providerConfig}
        primaryProviders={primaryProviderKeys}
        spotifyConnected
        spotifyArtistName='Tim White'
        appleMusicConnected
        appleMusicArtistName='Tim White'
        allowArtworkDownloads
        experienceAdapter={{
          mode: 'demo',
          entitlements: {
            isPro: true,
            canCreateManualReleases: true,
            canEditSmartLinks: true,
            canAccessFutureReleases: true,
            smartLinksLimit: null,
          },
          onCopy: async () => '',
          onCreateRelease: () => {},
          onSync: () => {},
          onRefreshRelease: () => {},
          onArtworkUpload: async (_file, release) => release.artworkUrl ?? '',
          onArtworkRevert: async (_id, release) => release?.artworkUrl ?? '',
          onAddDspLink: async () => {},
          onRescanIsrc: () => {},
          onSaveLyrics: async () => {},
          onFormatLyrics: async (_id, lyrics) => [lyrics],
          onCanvasStatusUpdate: async () => {},
          onToggleArtworkDownloads: async () => {},
          sidebarDataByReleaseId: DEMO_RELEASE_SIDEBAR_FIXTURES,
        }}
      />
    </div>
  );
}

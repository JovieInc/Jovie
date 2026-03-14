'use client';

import { toast } from 'sonner';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import {
  primaryProviderKeys,
  providerConfig,
} from '@/app/app/(shell)/dashboard/releases/config';
import { ReleasesExperience } from '@/components/dashboard/organisms/release-provider-matrix';
import type { ReleaseViewModel } from '@/lib/discography/types';
import type { CanvasStatus } from '@/lib/services/canvas/types';
import { DemoAuthShell } from './DemoAuthShell';
import {
  DEMO_RELEASE_SIDEBAR_FIXTURES,
  DEMO_RELEASE_VIEW_MODELS,
} from './mock-release-data';

async function copyDemoLink(path: string, label: string, _testId: string) {
  const origin = globalThis.location?.origin ?? 'https://jov.ie';
  const absoluteUrl = new URL(path, `${origin}/`).toString();
  try {
    await navigator.clipboard.writeText(absoluteUrl);
    toast.success(`${label} copied (demo)`);
  } catch {
    toast.error('Unable to copy link in demo mode');
  }
  return absoluteUrl;
}

function notifyDemoAction(message: string) {
  toast.info(message);
}

async function noopDemoAction(message: string) {
  notifyDemoAction(message);
}

async function uploadDemoArtwork(
  _file: File,
  release: ReleaseViewModel
): Promise<string> {
  notifyDemoAction(
    `Artwork editing for ${release.title} is disabled in demo mode`
  );
  return release.artworkUrl ?? '';
}

async function revertDemoArtwork(
  releaseId: string,
  release: ReleaseViewModel | null
): Promise<string> {
  notifyDemoAction('Artwork revert is disabled in demo mode');
  return release?.artworkUrl ?? '';
}

async function formatDemoLyrics(
  _releaseId: string,
  lyrics: string
): Promise<string[]> {
  notifyDemoAction('Lyrics formatting is disabled in demo mode');
  return [lyrics];
}

async function updateDemoCanvasStatus(
  _releaseId: string,
  _status: CanvasStatus
): Promise<void> {
  notifyDemoAction('Canvas updates are disabled in demo mode');
}

/**
 * DemoReleasesExperience — the full demo page content wrapped in the real
 * authenticated app shell (sidebar, header, nav) fed by mock data.
 *
 * Accepts optional dashboardData from a server component that fetches
 * a featured creator from the DB via getDemoCreator().
 */
export function DemoReleasesExperience({
  dashboardData,
}: {
  readonly dashboardData?: DashboardData;
} = {}) {
  return (
    <DemoAuthShell dashboardData={dashboardData}>
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
          onCopy: copyDemoLink,
          onCreateRelease: () =>
            notifyDemoAction('Creating releases is disabled in demo mode'),
          onSync: () =>
            notifyDemoAction('Spotify sync is disabled in demo mode'),
          onRefreshRelease: releaseId => {
            const release = DEMO_RELEASE_VIEW_MODELS.find(
              item => item.id === releaseId
            );
            notifyDemoAction(
              `Refresh is disabled for ${release?.title ?? 'this release'} in demo mode`
            );
          },
          onArtworkUpload: uploadDemoArtwork,
          onArtworkRevert: revertDemoArtwork,
          onAddDspLink: async (_releaseId, _provider, _url) =>
            noopDemoAction('Link editing is disabled in demo mode'),
          onRescanIsrc: () =>
            notifyDemoAction('ISRC rescans are disabled in demo mode'),
          onSaveLyrics: async () =>
            noopDemoAction('Lyrics editing is disabled in demo mode'),
          onFormatLyrics: formatDemoLyrics,
          onCanvasStatusUpdate: updateDemoCanvasStatus,
          onToggleArtworkDownloads: async enabled =>
            noopDemoAction(
              enabled
                ? 'Artwork downloads enabled (demo only)'
                : 'Artwork downloads disabled (demo only)'
            ),
          sidebarDataByReleaseId: DEMO_RELEASE_SIDEBAR_FIXTURES,
        }}
      />
    </DemoAuthShell>
  );
}

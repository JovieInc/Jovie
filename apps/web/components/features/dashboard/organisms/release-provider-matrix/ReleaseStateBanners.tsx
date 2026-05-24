'use client';

import type { ReleaseViewModel } from '@/lib/discography/types';
import { AppleMusicSyncBanner } from './AppleMusicSyncBanner';
import { ImportProgressBanner } from './ImportProgressBanner';
import { SmartLinkGateBanner } from './SmartLinkGateBanner';
import { SMART_LINK_SOFT_CAP } from './smart-link-gating';

interface ReleaseStateBannersProps {
  readonly rows: ReleaseViewModel[];
  readonly showImportProgress: boolean;
  readonly showReleasesTable: boolean;
  readonly artistName: string | null;
  readonly importedCount: number;
  readonly totalCount: number;
  readonly isAppleMusicConnected: boolean;
  readonly isImporting: boolean;
  readonly isSpotifyConnected: boolean;
  readonly isPro: boolean;
  readonly canAccessFutureReleases: boolean;
  readonly releasedCount: number;
  readonly unreleasedCount: number;
  readonly onAppleMusicMatchStatusChange: (
    connected: boolean,
    name: string | null
  ) => void;
}

export function ReleaseStateBanners({
  rows,
  showImportProgress,
  showReleasesTable,
  artistName,
  importedCount,
  totalCount,
  isAppleMusicConnected,
  isImporting,
  isSpotifyConnected,
  isPro,
  canAccessFutureReleases,
  releasedCount,
  unreleasedCount,
  onAppleMusicMatchStatusChange,
}: ReleaseStateBannersProps) {
  const firstProfileId = rows[0]?.profileId;

  return (
    <>
      {showImportProgress && (
        <div className='mx-3 lg:mx-4 mt-3'>
          <ImportProgressBanner
            artistName={artistName}
            importedCount={importedCount}
            totalCount={totalCount}
            visible={showImportProgress}
          />
        </div>
      )}

      {showReleasesTable &&
        firstProfileId &&
        !isAppleMusicConnected &&
        !isImporting && (
          <AppleMusicSyncBanner
            profileId={firstProfileId}
            spotifyConnected={isSpotifyConnected}
            releases={rows}
            onMatchStatusChange={onAppleMusicMatchStatusChange}
            className='mx-3 lg:mx-4 mt-3'
          />
        )}

      {showReleasesTable && !isPro && releasedCount > SMART_LINK_SOFT_CAP && (
        <SmartLinkGateBanner
          mode='soft-cap'
          releasedCount={releasedCount}
          softCap={SMART_LINK_SOFT_CAP}
          className='mx-3 lg:mx-4 mt-3'
        />
      )}

      {showReleasesTable &&
        !isPro &&
        !canAccessFutureReleases &&
        unreleasedCount > 0 && (
          <SmartLinkGateBanner
            mode='unreleased'
            unreleasedCount={unreleasedCount}
            className='mx-3 lg:mx-4 mt-3'
          />
        )}
    </>
  );
}

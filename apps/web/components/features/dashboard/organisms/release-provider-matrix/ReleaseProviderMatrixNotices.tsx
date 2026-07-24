'use client';
import { lazy, Suspense } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { DrawerButton, DrawerSurfaceCard } from '@/components/molecules/drawer';
import { DialogLoadingSkeleton } from '@/components/organisms/DialogLoadingSkeleton';
import { PageShell } from '@/components/organisms/PageShell';
import type { ReleaseViewModel } from '@/lib/discography/types';
import type { ReleaseContext } from '@/lib/release-tasks/applicability';
import { cn } from '@/lib/utils';

// Lazy load AddReleaseSidebar

const ImportProgressBanner = lazy(() =>
  import('./ImportProgressBanner').then(m => ({
    default: m.ImportProgressBanner,
  }))
);

const AppleMusicSyncBanner = lazy(() =>
  import('./AppleMusicSyncBanner').then(m => ({
    default: m.AppleMusicSyncBanner,
  }))
);

const SmartLinkGateBanner = lazy(() =>
  import('./SmartLinkGateBanner').then(m => ({
    default: m.SmartLinkGateBanner,
  }))
);

const ReleasePlanWizard = lazy(() =>
  import('./ReleasePlanWizard').then(m => ({
    default: m.ReleasePlanWizard,
  }))
);

const SMART_LINK_SOFT_CAP = 100;

export function ReleaseImportProgressNotice({
  visible,
  artistName,
  importedCount,
  totalCount,
}: {
  readonly visible: boolean;
  readonly artistName: string | null;
  readonly importedCount: number;
  readonly totalCount: number;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className='mx-3 lg:mx-4 mt-3'>
      <Suspense fallback={null}>
        <ImportProgressBanner
          artistName={artistName}
          importedCount={importedCount}
          totalCount={totalCount}
          visible={visible}
        />
      </Suspense>
    </div>
  );
}

export function ReleaseAppleMusicSyncNotice({
  showReleasesTable,
  profileId,
  isAppleMusicConnected,
  isImporting,
  spotifyConnected,
  releases,
  onMatchStatusChange,
}: {
  readonly showReleasesTable: boolean;
  readonly profileId: string | null;
  readonly isAppleMusicConnected: boolean;
  readonly isImporting: boolean;
  readonly spotifyConnected: boolean;
  readonly releases: ReleaseViewModel[];
  readonly onMatchStatusChange: (
    connected: boolean,
    name: string | null
  ) => void;
}) {
  if (
    !showReleasesTable ||
    !profileId ||
    isAppleMusicConnected ||
    isImporting
  ) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <AppleMusicSyncBanner
        profileId={profileId}
        spotifyConnected={spotifyConnected}
        releases={releases}
        onMatchStatusChange={onMatchStatusChange}
        className='mx-3 lg:mx-4 mt-3'
      />
    </Suspense>
  );
}

export function ReleaseSmartLinkNotices({
  showReleasesTable,
  isPro,
  releasedCount,
  canAccessFutureReleases,
  unreleasedCount,
}: {
  readonly showReleasesTable: boolean;
  readonly isPro: boolean;
  readonly releasedCount: number;
  readonly canAccessFutureReleases: boolean;
  readonly unreleasedCount: number;
}) {
  if (!showReleasesTable || isPro) {
    return null;
  }

  const showSoftCap = releasedCount > SMART_LINK_SOFT_CAP;
  const showUnreleased = !canAccessFutureReleases && unreleasedCount > 0;

  return (
    <>
      {showSoftCap ? (
        <Suspense fallback={null}>
          <SmartLinkGateBanner
            mode='soft-cap'
            releasedCount={releasedCount}
            softCap={SMART_LINK_SOFT_CAP}
            className='mx-3 lg:mx-4 mt-3'
          />
        </Suspense>
      ) : null}
      {showUnreleased ? (
        <Suspense fallback={null}>
          <SmartLinkGateBanner
            mode='unreleased'
            unreleasedCount={unreleasedCount}
            className='mx-3 lg:mx-4 mt-3'
          />
        </Suspense>
      ) : null}
    </>
  );
}

export function ConnectedReleaseEmptyState({
  visible,
  canCreateManualReleases,
  isSyncing,
  onSync,
  onCreateManual,
}: {
  readonly visible: boolean;
  readonly canCreateManualReleases: boolean;
  readonly isSyncing: boolean;
  readonly onSync: () => void | Promise<void>;
  readonly onCreateManual: () => void;
}) {
  if (!visible) {
    return null;
  }

  const description = canCreateManualReleases
    ? 'Sync from Spotify or create one manually to start generating smart links.'
    : 'Sync from Spotify to start generating smart links.';

  return (
    <PageShell className='mt-2.5' data-testid='release-table-shell'>
      <DrawerSurfaceCard
        variant='card'
        className='flex min-h-53 flex-col items-center justify-center px-5 py-9 text-center'
        testId='releases-empty-state-connected'
      >
        <div className='mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg border border-subtle bg-surface-1'>
          <Icon
            name='Disc3'
            className='size-4 text-tertiary-token'
            aria-hidden='true'
          />
        </div>
        <h3 className='text-app font-caption text-primary-token'>
          No Releases Yet
        </h3>
        <p className='mt-0.5 max-w-sm text-xs leading-[17px] text-secondary-token'>
          {description}
        </p>
        <div className='mt-3 flex flex-wrap items-center justify-center gap-2.5'>
          <DrawerButton
            tone='primary'
            disabled={isSyncing}
            onClick={onSync}
            className='h-7 rounded-lg px-2.5 text-2xs inline-flex items-center gap-2'
            data-testid='sync-spotify-empty-state'
          >
            <Icon
              name={isSyncing ? 'Loader2' : 'RefreshCw'}
              className={cn(
                'size-4',
                isSyncing && 'animate-spin motion-reduce:animate-none'
              )}
              aria-hidden='true'
            />
            {isSyncing ? 'Syncing...' : 'Sync from Spotify'}
          </DrawerButton>
          {canCreateManualReleases ? (
            <DrawerButton
              onClick={onCreateManual}
              className='h-7 rounded-lg px-2.5 text-2xs inline-flex items-center gap-2'
              data-testid='create-release-empty-state'
            >
              <Icon name='Plus' className='size-4' aria-hidden='true' />
              Create Release
            </DrawerButton>
          ) : null}
        </div>
      </DrawerSurfaceCard>
    </PageShell>
  );
}

export function ReleasePlanDialog({
  open,
  release,
  isGateLoading,
  canGenerateReleasePlans,
  isGeneratingReleasePlan,
  onClose,
  onSubmit,
}: {
  readonly open: boolean;
  readonly release: ReleaseViewModel | null;
  readonly isGateLoading: boolean;
  readonly canGenerateReleasePlans: boolean;
  readonly isGeneratingReleasePlan: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (ctx?: ReleaseContext) => Promise<void>;
}) {
  const isVisible = open && release !== null;

  return (
    <Suspense
      fallback={
        isVisible ? (
          <DialogLoadingSkeleton open onClose={onClose} size='sm' rows={3} />
        ) : null
      }
    >
      {isVisible && release ? (
        <ReleasePlanWizard
          open
          releaseTitle={release.title}
          isGateLoading={isGateLoading}
          canGenerateReleasePlans={canGenerateReleasePlans}
          isGeneratingReleasePlan={isGeneratingReleasePlan}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </Suspense>
  );
}

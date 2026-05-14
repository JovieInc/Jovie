'use client';

import { Suspense } from 'react';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { DialogLoadingSkeleton } from '@/components/organisms/DialogLoadingSkeleton';
import type { ReleaseViewModel } from '@/lib/discography/types';
import type { ReleaseContext } from '@/lib/release-tasks/applicability';
import type { AppleMusicArtistSelection } from './apple-music-connection';
import { isDistributedRelease } from './release-deletion';
import {
  ArtistSearchCommandPalette,
  ReleasePlanWizard,
  SpotifyConnectDialog,
} from './release-lazy-components';

interface ReleaseWorkflowOverlaysProps {
  readonly amPaletteOpen: boolean;
  readonly setAmPaletteOpen: (open: boolean) => void;
  readonly spotifySearchOpen: boolean;
  readonly setSpotifySearchOpen: (open: boolean) => void;
  readonly onAppleMusicConnect: (
    artist: AppleMusicArtistSelection
  ) => void | Promise<void>;
  readonly onSpotifyConnected: (
    releases: ReleaseViewModel[],
    artistName: string
  ) => void;
  readonly onSpotifyImportStart: (artistName: string) => void;
  readonly postCreateRelease: ReleaseViewModel | null;
  readonly isPostCreatePlanModalOpen: boolean;
  readonly isReleasePlanGateLoading: boolean;
  readonly canGenerateReleasePlans: boolean;
  readonly isGeneratingReleasePlan: boolean;
  readonly closePostCreatePlanModal: () => void;
  readonly onGenerateReleasePlan: (
    context?: ReleaseContext
  ) => void | Promise<void>;
  readonly deleteTarget: ReleaseViewModel | null;
  readonly isDeleting: boolean;
  readonly closeDeleteDialog: () => void;
  readonly onDeleteConfirm: () => void | Promise<void>;
}

export function ReleaseWorkflowOverlays({
  amPaletteOpen,
  setAmPaletteOpen,
  spotifySearchOpen,
  setSpotifySearchOpen,
  onAppleMusicConnect,
  onSpotifyConnected,
  onSpotifyImportStart,
  postCreateRelease,
  isPostCreatePlanModalOpen,
  isReleasePlanGateLoading,
  canGenerateReleasePlans,
  isGeneratingReleasePlan,
  closePostCreatePlanModal,
  onGenerateReleasePlan,
  deleteTarget,
  isDeleting,
  closeDeleteDialog,
  onDeleteConfirm,
}: ReleaseWorkflowOverlaysProps) {
  return (
    <>
      <Suspense
        fallback={
          amPaletteOpen ? (
            <DialogLoadingSkeleton
              open={amPaletteOpen}
              onClose={() => setAmPaletteOpen(false)}
              size='lg'
              rows={3}
            />
          ) : null
        }
      >
        {amPaletteOpen ? (
          <ArtistSearchCommandPalette
            open={amPaletteOpen}
            onOpenChange={setAmPaletteOpen}
            provider='apple_music'
            onArtistSelect={onAppleMusicConnect}
          />
        ) : null}
      </Suspense>

      <Suspense
        fallback={
          spotifySearchOpen ? (
            <DialogLoadingSkeleton
              open={spotifySearchOpen}
              onClose={() => setSpotifySearchOpen(false)}
              size='lg'
              rows={3}
            />
          ) : null
        }
      >
        <SpotifyConnectDialog
          open={spotifySearchOpen}
          onOpenChange={setSpotifySearchOpen}
          onConnected={onSpotifyConnected}
          onImportStart={onSpotifyImportStart}
        />
      </Suspense>

      <Suspense
        fallback={
          isPostCreatePlanModalOpen && postCreateRelease !== null ? (
            <DialogLoadingSkeleton
              open
              onClose={closePostCreatePlanModal}
              size='sm'
              rows={3}
            />
          ) : null
        }
      >
        {isPostCreatePlanModalOpen && postCreateRelease !== null ? (
          <ReleasePlanWizard
            open
            releaseTitle={postCreateRelease.title}
            isGateLoading={isReleasePlanGateLoading}
            canGenerateReleasePlans={canGenerateReleasePlans}
            isGeneratingReleasePlan={isGeneratingReleasePlan}
            onClose={closePostCreatePlanModal}
            onSubmit={onGenerateReleasePlan}
          />
        ) : null}
      </Suspense>

      {deleteTarget && (
        <ConfirmDialog
          open
          onOpenChange={open => {
            if (!open) closeDeleteDialog();
          }}
          title={
            isDistributedRelease(deleteTarget)
              ? 'Release is distributed'
              : `Delete "${deleteTarget.title}"?`
          }
          description={
            isDistributedRelease(deleteTarget)
              ? 'Remove this release from distribution before deleting it.'
              : 'This will remove the release from your dashboard and public profile.'
          }
          confirmLabel={isDistributedRelease(deleteTarget) ? 'OK' : 'Delete'}
          variant={
            isDistributedRelease(deleteTarget) ? 'default' : 'destructive'
          }
          isLoading={isDeleting}
          onConfirm={
            isDistributedRelease(deleteTarget)
              ? closeDeleteDialog
              : onDeleteConfirm
          }
        />
      )}
    </>
  );
}

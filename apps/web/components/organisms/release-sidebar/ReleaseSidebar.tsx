'use client';

/**
 * ReleaseSidebar Component
 *
 * A sidebar component for displaying and editing release details,
 * including artwork, title, release date, and DSP links.
 */

import type { CommonDropdownItem } from '@jovie/ui';
import {
  Copy,
  ExternalLink,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { updateAllowArtworkDownloads } from '@/app/app/(shell)/dashboard/releases/actions';
import { Icon } from '@/components/atoms/Icon';
import { ReleaseTaskChecklist } from '@/components/features/dashboard/release-tasks';
import {
  DrawerAsyncToggle,
  DrawerMediaThumb,
  DrawerSurfaceCard,
  DrawerTabs,
  EntityHeaderCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { APP_ROUTES } from '@/constants/routes';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import {
  AlbumArtworkContextMenu,
  buildArtworkSizes,
} from '@/features/release/AlbumArtworkContextMenu';
import { formatReleaseArtistLine } from '@/lib/discography/formatting';
import type { ReleaseSidebarTrack } from '@/lib/discography/types';
import type { CanvasStatus } from '@/lib/services/canvas/types';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { buildUTMContext, getUTMShareDropdownItems } from '@/lib/utm';
import { ReleaseDspLinks } from './ReleaseDspLinks';
import { ReleaseFields } from './ReleaseFields';
import { ReleaseLyricsSection } from './ReleaseLyricsSection';
import { ReleaseMetadata } from './ReleaseMetadata';
import { useReleaseHeaderParts } from './ReleaseSidebarHeader';
import { ReleaseSmartLinkAnalytics } from './ReleaseSmartLinkAnalytics';
import { ReleaseSmartLinkSection } from './ReleaseSmartLinkSection';
import { ReleaseTrackList } from './ReleaseTrackList';
import { TrackDetailPanel, type TrackForDetail } from './TrackDetailPanel';
import type { Release, ReleaseSidebarProps } from './types';
import { useReleaseSidebar } from './useReleaseSidebar';
import { useTrackAudioPlayer } from './useTrackAudioPlayer';

/** Tab for organizing sidebar content into focused views */
type SidebarTab = 'tracklist' | 'links' | 'details' | 'lyrics' | 'tasks';

/** Options for sidebar tab segment control */
const SIDEBAR_TAB_OPTIONS = [
  { value: 'tracklist' as const, label: 'Tracks' },
  { value: 'links' as const, label: 'Platforms' },
  { value: 'details' as const, label: 'Details' },
  { value: 'lyrics' as const, label: 'Lyrics' },
  { value: 'tasks' as const, label: 'Tasks' },
];

const RELEASE_SIDEBAR_CARD_CLASSNAME = cn(
  LINEAR_SURFACE.sidebarCard,
  'overflow-hidden bg-[color-mix(in_oklab,var(--linear-bg-surface-0)_94%,transparent)]'
);

function getPreviewAriaLabel(hasPreview: boolean, isPlaying: boolean): string {
  if (!hasPreview) return 'No preview available';
  return isPlaying ? 'Pause preview' : 'Play preview';
}

interface ReleaseEntityHeaderProps {
  readonly release: Release;
  readonly artistName: string | null | undefined;
  readonly canUploadArtwork: boolean;
  readonly canRevertArtwork: boolean;
  readonly onArtworkUpload: ((file: File) => Promise<string>) | undefined;
  readonly onArtworkRevert: (() => void) | undefined;
  readonly allowDownloads: boolean;
  readonly previewUrl: string | null | undefined;
  readonly isPlaying: boolean;
  readonly onTogglePreview: () => void;
}

function ReleaseEntityHeader({
  release,
  artistName,
  canUploadArtwork,
  canRevertArtwork,
  onArtworkUpload,
  onArtworkRevert,
  allowDownloads,
  previewUrl,
  isPlaying,
  onTogglePreview,
}: ReleaseEntityHeaderProps) {
  const artworkAlt = release.title
    ? `${release.title} artwork`
    : 'Release artwork';
  const artistLine = formatReleaseArtistLine(release.artistNames, artistName);

  return (
    <DrawerSurfaceCard
      className={RELEASE_SIDEBAR_CARD_CLASSNAME}
      testId='release-header-card'
    >
      <div className='p-2.5'>
        <p className='mb-1 text-[10.5px] font-[510] leading-none text-tertiary-token'>
          Release
        </p>
        <div className='flex items-start gap-2.5'>
          <div className='group/artwork relative shrink-0'>
            <AlbumArtworkContextMenu
              title={release.title}
              sizes={buildArtworkSizes(undefined, release.artworkUrl)}
              allowDownloads={allowDownloads}
              releaseId={release.id}
              canRevert={canRevertArtwork}
              onRevert={canRevertArtwork ? onArtworkRevert : undefined}
            >
              {canUploadArtwork && onArtworkUpload ? (
                <AvatarUploadable
                  src={release.artworkUrl}
                  alt={artworkAlt}
                  name={release.title}
                  size='2xl'
                  rounded='md'
                  uploadable={canUploadArtwork}
                  onUpload={onArtworkUpload}
                  showHoverOverlay
                />
              ) : (
                <DrawerMediaThumb
                  src={release.artworkUrl}
                  alt={artworkAlt}
                  sizeClassName='h-[68px] w-[68px] rounded-[10px]'
                  sizes='68px'
                  fallback={
                    <Icon
                      name='Disc3'
                      className='h-10 w-10 text-tertiary-token'
                      aria-hidden='true'
                    />
                  }
                />
              )}
            </AlbumArtworkContextMenu>

            <button
              type='button'
              onClick={onTogglePreview}
              disabled={!previewUrl}
              aria-pressed={isPlaying}
              className={cn(
                'absolute inset-0 flex items-center justify-center rounded-lg transition-all duration-160',
                'bg-black/0 opacity-0',
                'group-hover/artwork:bg-black/40 group-hover/artwork:opacity-100',
                'aria-[pressed=true]:bg-black/40 aria-[pressed=true]:opacity-100',
                'disabled:pointer-events-none disabled:hidden'
              )}
              aria-label={getPreviewAriaLabel(Boolean(previewUrl), isPlaying)}
            >
              {isPlaying ? (
                <Pause className='h-5 w-5 text-white drop-shadow-sm' />
              ) : (
                <Play className='h-5 w-5 translate-x-px text-white drop-shadow-sm' />
              )}
            </button>
          </div>

          <EntityHeaderCard
            title={release.title}
            subtitle={
              artistLine ? (
                <span className='line-clamp-2 block'>{artistLine}</span>
              ) : null
            }
            meta={
              <ReleaseFields
                releaseDate={release.releaseDate}
                releaseType={release.releaseType}
                totalTracks={release.totalTracks}
                platformCount={release.providers.length}
              />
            }
            className='min-w-0 flex-1'
            bodyClassName='pt-0'
          />
        </div>
      </div>

      <div className='border-t border-(--linear-app-frame-seam) bg-surface-0/35 px-2.5 py-2'>
        <ReleaseSmartLinkSection smartLinkPath={release.smartLinkPath} />
      </div>
    </DrawerSurfaceCard>
  );
}

function buildContextMenuItems(
  release: Release | null,
  artistName: string | null | undefined,
  handleCopySmartLink: () => void,
  onRefresh: (() => void) | undefined,
  isRefreshing: boolean
): CommonDropdownItem[] {
  if (!release) return [];

  const smartLinkUrl = `${getBaseUrl()}${release.smartLinkPath}`;
  const items: CommonDropdownItem[] = [];

  const utmContext = buildUTMContext({
    smartLinkUrl,
    releaseSlug: release.slug,
    releaseTitle: release.title,
    artistName,
    releaseDate: release.releaseDate,
  });

  items.push(
    {
      type: 'action',
      id: 'copy-url',
      label: 'Copy smart link',
      icon: <Copy className='h-4 w-4' />,
      onClick: () => {
        handleCopySmartLink();
      },
    },
    {
      type: 'action',
      id: 'open-release',
      label: 'Open release',
      icon: <ExternalLink className='h-4 w-4' />,
      onClick: () => globalThis.open(smartLinkUrl, '_blank'),
    },
    // UTM share presets
    ...getUTMShareDropdownItems({
      smartLinkUrl,
      context: utmContext,
    })
  );

  // "Copy Use Sound link" — only when release has video provider links
  if (release.hasVideoLinks) {
    const soundsUrl = `${getBaseUrl()}${release.smartLinkPath}/sounds`;
    items.push(
      { type: 'separator', id: 'sep-sounds' },
      {
        type: 'action',
        id: 'copy-sounds-link',
        label: 'Copy Use Sound link',
        icon: <Sparkles className='h-4 w-4' />,
        onClick: () => {
          navigator.clipboard
            ?.writeText(soundsUrl)
            .then(() => {
              toast.success('Use Sound link copied');
            })
            .catch(() => {
              // Silently fail
            });
        },
      }
    );
  }

  items.push(
    { type: 'separator', id: 'sep-actions' },
    {
      type: 'action',
      id: 'refresh',
      label: isRefreshing ? 'Refreshing…' : 'Refresh',
      icon: <RefreshCw className='h-4 w-4' />,
      onClick: () => {
        if (isRefreshing) return;
        if (onRefresh) {
          onRefresh();
        } else {
          globalThis.location.reload();
        }
      },
    }
  );

  return items;
}

export function ReleaseSidebar({
  release,
  mode,
  isOpen,
  width,
  providerConfig,
  artistName,
  onClose,
  onRefresh,
  isRefreshing = false,
  onReleaseChange,
  onArtworkUpload,
  onArtworkRevert,
  onAddDspLink,
  onRemoveDspLink,
  onRescanIsrc,
  isRescanningIsrc = false,
  onSaveLyrics,
  onFormatLyrics,
  isLyricsSaving = false,
  allowDownloads = false,
  onToggleArtworkDownloads,
  readOnly = false,
  tracksOverride,
  analyticsOverride,
  onCanvasStatusUpdate,
  onTrackClick: externalTrackClick,
}: ReleaseSidebarProps) {
  const {
    isAddingLink,
    setIsAddingLink,
    newLinkUrl,
    setNewLinkUrl,
    selectedProvider,
    setSelectedProvider,
    isEditable: _isEditable,
    hasRelease,
    canUploadArtwork: _canUploadArtwork,
    canRevertArtwork: _canRevertArtwork,
    isAddingDspLink,
    isRemovingDspLink,
    handleArtworkUpload,
    handleArtworkRevert,
    handleCopySmartLink,
    handleAddLink,
    handleRemoveLink,
    handleNewLinkKeyDown,
    handleKeyDown,
  } = useReleaseSidebar({
    release,
    mode,
    onClose,
    onReleaseChange,
    onArtworkUpload,
    onArtworkRevert,
    onAddDspLink,
    onRemoveDspLink,
  });

  // When readOnly, disable all editing capabilities
  const isEditable = readOnly ? false : _isEditable;
  const canUploadArtwork = readOnly ? false : _canUploadArtwork;
  const canRevertArtwork = readOnly ? false : _canRevertArtwork;

  // Sidebar tab state
  const [activeTab, setActiveTab] = useState<SidebarTab>('tracklist');

  // Track detail panel state — track shape comes from the sidebar route handler
  const [selectedTrack, setSelectedTrack] = useState<TrackForDetail | null>(
    null
  );

  // Reset selected track when release changes (preserve active tab for workflow continuity)
  useEffect(() => {
    setSelectedTrack(null);
  }, [release?.id]);

  const handleTrackClick = useCallback(
    (track: ReleaseSidebarTrack) => {
      if (externalTrackClick) {
        externalTrackClick(track);
        return;
      }
      setSelectedTrack(track);
    },
    [externalTrackClick]
  );

  const handleBackToRelease = useCallback(() => {
    setSelectedTrack(null);
  }, []);

  const handleCanvasStatusChange = useCallback(
    (status: CanvasStatus) => {
      if (!release || !onCanvasStatusUpdate) return;
      void onCanvasStatusUpdate(release.id, status);
    },
    [release, onCanvasStatusUpdate]
  );

  const canEditCanvasStatus = Boolean(release && onCanvasStatusUpdate);

  // Audio preview player
  const { playbackState, toggleTrack } = useTrackAudioPlayer();
  const sidebarPreviewUrl = release?.previewUrl;
  const isReleasePlaying =
    playbackState.activeTrackId === release?.id && playbackState.isPlaying;

  const handleToggleReleasePreview = useCallback(() => {
    if (!release?.previewUrl) return;
    toggleTrack({
      id: release.id,
      title: release.title,
      audioUrl: release.previewUrl,
      releaseTitle: release.title,
      artistName: release.artistNames?.[0],
      artworkUrl: release.artworkUrl,
    }).catch(() => {});
  }, [toggleTrack, release]);

  const contextMenuItems = useMemo<CommonDropdownItem[]>(
    () =>
      buildContextMenuItems(
        release,
        artistName,
        handleCopySmartLink,
        onRefresh,
        isRefreshing
      ),
    [release, handleCopySmartLink, onRefresh, isRefreshing, artistName]
  );

  const { title: headerTitle, actions: headerActions } = useReleaseHeaderParts({
    release,
    hasRelease,
    artistName: artistName ?? undefined,
    onRefresh,
    isRefreshing,
    onCopySmartLink: () => {
      handleCopySmartLink();
    },
    onClose,
  });

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      width={width}
      ariaLabel='Release details'
      onKeyDown={handleKeyDown}
      contextMenuItems={contextMenuItems}
      data-testid='release-sidebar'
      title={headerTitle}
      onClose={onClose}
      headerActions={headerActions}
      isEmpty={!release}
      emptyMessage='Select a release in the table to view its details.'
      footer={
        release && !selectedTrack && isEditable ? (
          <DrawerAsyncToggle
            density='compact'
            label='Art downloads'
            ariaLabel='Allow artwork downloads on public pages'
            checked={allowDownloads}
            onToggle={onToggleArtworkDownloads ?? updateAllowArtworkDownloads}
            successMessage={on =>
              on
                ? 'Artwork downloads enabled for visitors'
                : 'Artwork downloads disabled'
            }
          />
        ) : undefined
      }
    >
      {selectedTrack && release && (
        <TrackDetailPanel
          track={selectedTrack}
          releaseTitle={release.title}
          onBack={handleBackToRelease}
        />
      )}
      {!(selectedTrack && release) && release && (
        <>
          <ReleaseEntityHeader
            release={release}
            artistName={artistName}
            canUploadArtwork={canUploadArtwork}
            canRevertArtwork={canRevertArtwork}
            onArtworkUpload={handleArtworkUpload}
            onArtworkRevert={handleArtworkRevert}
            allowDownloads={allowDownloads}
            previewUrl={sidebarPreviewUrl}
            isPlaying={isReleasePlaying}
            onTogglePreview={handleToggleReleasePreview}
          />

          <ReleaseSmartLinkAnalytics
            release={release}
            analyticsOverride={analyticsOverride}
          />

          <DrawerSurfaceCard
            className={RELEASE_SIDEBAR_CARD_CLASSNAME}
            testId='release-tab-panel-card'
          >
            <div className='border-b border-(--linear-app-frame-seam) px-2.5 py-1.5'>
              <DrawerTabs
                value={activeTab}
                onValueChange={value => setActiveTab(value as SidebarTab)}
                options={SIDEBAR_TAB_OPTIONS}
                ariaLabel='Release sidebar view'
              />
            </div>

            <div className='space-y-2 bg-[color-mix(in_oklab,var(--linear-bg-surface-0)_92%,transparent)] p-2'>
              {activeTab === 'tracklist' && (
                <ReleaseTrackList
                  release={release}
                  onTrackClick={handleTrackClick}
                  tracksOverride={tracksOverride}
                />
              )}

              {activeTab === 'links' && (
                <ReleaseDspLinks
                  release={release}
                  providerConfig={providerConfig}
                  isEditable={isEditable}
                  isAddingLink={isAddingLink}
                  newLinkUrl={newLinkUrl}
                  selectedProvider={selectedProvider}
                  isAddingDspLink={isAddingDspLink}
                  isRemovingDspLink={isRemovingDspLink}
                  onSetIsAddingLink={setIsAddingLink}
                  onSetNewLinkUrl={setNewLinkUrl}
                  onSetSelectedProvider={setSelectedProvider}
                  onAddLink={handleAddLink}
                  onRemoveLink={handleRemoveLink}
                  onNewLinkKeyDown={handleNewLinkKeyDown}
                  onRescanIsrc={onRescanIsrc}
                  isRescanningIsrc={isRescanningIsrc}
                />
              )}

              {activeTab === 'details' && (
                <ReleaseMetadata
                  release={release}
                  onCanvasStatusChange={
                    canEditCanvasStatus ? handleCanvasStatusChange : undefined
                  }
                />
              )}

              {activeTab === 'lyrics' && (
                <ReleaseLyricsSection
                  releaseId={release.id}
                  lyrics={release.lyrics}
                  isEditable={isEditable}
                  isSaving={isLyricsSaving}
                  onSaveLyrics={onSaveLyrics}
                  onFormatLyrics={onFormatLyrics}
                />
              )}

              {activeTab === 'tasks' && (
                <ReleaseTaskChecklist
                  releaseId={release.id}
                  variant='compact'
                  onNavigateToFullPage={() => {
                    window.location.href = `${APP_ROUTES.DASHBOARD_RELEASES}/${release.id}/tasks`;
                  }}
                />
              )}
            </div>
          </DrawerSurfaceCard>
        </>
      )}
    </EntitySidebarShell>
  );
}

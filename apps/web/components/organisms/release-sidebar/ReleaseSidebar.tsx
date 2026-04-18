'use client';

/**
 * ReleaseSidebar Component
 *
 * A sidebar component for displaying and editing release details,
 * including artwork, title, release date, and DSP links.
 */

import type { CommonDropdownItem } from '@jovie/ui';
import { Pause, Play, Plus, RefreshCw } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { updateAllowArtworkDownloads } from '@/app/app/(shell)/dashboard/releases/actions';
import { Icon } from '@/components/atoms/Icon';
import { ReleaseTaskChecklist } from '@/components/features/dashboard/release-tasks';
import {
  DrawerAsyncToggle,
  DrawerCardActionBar,
  DrawerFormGridRow,
  DrawerInspectorCard,
  DrawerMediaThumb,
  DrawerSection,
  DrawerSplitButton,
  DrawerSurfaceCard,
  DrawerTabbedCard,
  DrawerTabs,
  EntityHeaderCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { convertToCommonDropdownItems } from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { buildReleaseActions } from '@/features/dashboard/organisms/releases/release-actions';
import { CompactReleasePlanUpgradeCard } from '@/features/dashboard/tasks/TasksUpgradeInterstitial';
import {
  AlbumArtworkContextMenu,
  buildArtworkSizes,
} from '@/features/release/AlbumArtworkContextMenu';
import { copyToClipboard } from '@/hooks/useClipboard';
import { formatReleaseArtistLine } from '@/lib/discography/formatting';
import type { ProviderKey } from '@/lib/discography/types';
import { usePlanGate } from '@/lib/queries';
import type { CanvasStatus } from '@/lib/services/canvas/types';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { ReleaseDspLinks } from './ReleaseDspLinks';
import { ReleaseFields } from './ReleaseFields';
import { ReleaseLyricsSection } from './ReleaseLyricsSection';
import { ReleasePitchSection } from './ReleasePitchSection';
import { ReleasePropertiesPanel } from './ReleasePropertiesPanel';
import { useReleaseHeaderParts } from './ReleaseSidebarHeader';
import { ReleaseSmartLinkAnalytics } from './ReleaseSmartLinkAnalytics';
import { ReleaseTargetPlaylistsSection } from './ReleaseTargetPlaylistsSection';
import { ReleaseTrackList } from './ReleaseTrackList';
import type { Release, ReleaseSidebarProps } from './types';
import { useReleaseSidebar } from './useReleaseSidebar';
import { useTrackAudioPlayer } from './useTrackAudioPlayer';

const RELEASE_SIDEBAR_CARD_CLASSNAME = 'overflow-hidden';
const PLATFORM_RESCAN_COOLDOWN_MS = 5 * 60 * 1000;

type ReleaseSidebarTab = 'details' | 'dsps' | 'tracks';

function formatCooldown(remainingMs: number): string {
  if (remainingMs <= 0) return '';
  const seconds = Math.ceil(remainingMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m`;
}

function getPlatformRescanLabel(params: {
  isRescanning: boolean;
  isCoolingDown: boolean;
  remainingMs: number;
}): string {
  if (params.isRescanning) {
    return 'Refreshing DSPs…';
  }

  if (params.isCoolingDown) {
    return `Refresh again in ${formatCooldown(params.remainingMs)}`;
  }

  return 'Refresh DSPs';
}

function getPreviewAriaLabel(hasPreview: boolean, isPlaying: boolean): string {
  if (!hasPreview) return 'No preview available';
  return isPlaying ? 'Pause preview' : 'Play preview';
}

interface ReleaseEntityHeaderProps {
  readonly headerLabel: string;
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
  readonly actionBar?: ReactNode;
  readonly footer?: ReactNode;
}

function ReleaseEntityHeader({
  headerLabel,
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
  actionBar,
  footer,
}: ReleaseEntityHeaderProps) {
  const artworkAlt = release.title
    ? `${release.title} artwork`
    : 'Release artwork';
  const artistLine = formatReleaseArtistLine(release.artistNames, artistName);
  const hasActionBar = Boolean(actionBar);

  return (
    <DrawerSurfaceCard
      variant='card'
      className={RELEASE_SIDEBAR_CARD_CLASSNAME}
      testId='release-header-card'
    >
      <div className='relative p-2.5'>
        {hasActionBar ? (
          <div className='absolute right-2.5 top-2.5'>{actionBar}</div>
        ) : null}
        {headerLabel ? (
          <p className='mb-1 truncate font-mono text-[10.5px] font-[510] leading-none tracking-[0.025em] text-quaternary-token'>
            {headerLabel}
          </p>
        ) : null}
        <div className={cn('flex items-start gap-2.5', hasActionBar && 'pr-9')}>
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
                revealDate={release.revealDate}
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
      {footer ? (
        <div className='border-t border-(--linear-app-frame-seam) px-3 py-2.5'>
          {footer}
        </div>
      ) : null}
    </DrawerSurfaceCard>
  );
}

function ReleaseArtworkDownloadsSetting({
  allowDownloads,
  onToggleArtworkDownloads,
}: {
  readonly allowDownloads: boolean;
  readonly onToggleArtworkDownloads:
    | ((value: boolean) => Promise<void>)
    | undefined;
}) {
  return (
    <DrawerFormGridRow label='Artwork' className='items-start'>
      <DrawerAsyncToggle
        label='Allow Downloads'
        ariaLabel='Allow artwork downloads on public pages'
        checked={allowDownloads}
        onToggle={onToggleArtworkDownloads ?? updateAllowArtworkDownloads}
        successMessage={on =>
          on
            ? 'Artwork downloads enabled for visitors'
            : 'Artwork downloads disabled'
        }
        density='compact'
      />
    </DrawerFormGridRow>
  );
}

export function ReleaseSidebar({
  release,
  mode,
  isOpen,
  width,
  providerConfig,
  artistName,
  canGenerateAlbumArt,
  onGenerateAlbumArt,
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
  onSaveTargetPlaylists,
  onSaveLyrics,
  onSaveMetadata,
  onSavePrimaryIsrc,
  onFormatLyrics,
  isLyricsSaving = false,
  allowDownloads = false,
  onToggleArtworkDownloads,
  readOnly = false,
  tracksOverride,
  analyticsOverride,
  showCredits = true,
  onCanvasStatusUpdate,
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

  const { canAccessTasksWorkspace, isLoading: isTasksWorkspaceGateLoading } =
    usePlanGate();
  const [showTasksUpgrade, setShowTasksUpgrade] = useState(true);
  const [activeTab, setActiveTab] = useState<ReleaseSidebarTab>('details');
  const [platformRescanCooldownEnd, setPlatformRescanCooldownEnd] = useState(0);
  const [platformRescanRemainingMs, setPlatformRescanRemainingMs] = useState(0);
  const platformRescanTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const wasRescanningPlatformsRef = useRef(false);

  useEffect(() => {
    setPlatformRescanCooldownEnd(0);
    setPlatformRescanRemainingMs(0);
    setShowTasksUpgrade(true);
    setActiveTab('details');
  }, [release?.id]);

  useEffect(() => {
    if (isRescanningIsrc) {
      wasRescanningPlatformsRef.current = true;
      return;
    }

    if (!wasRescanningPlatformsRef.current) {
      return;
    }

    wasRescanningPlatformsRef.current = false;
    setPlatformRescanCooldownEnd(Date.now() + PLATFORM_RESCAN_COOLDOWN_MS);
    setPlatformRescanRemainingMs(PLATFORM_RESCAN_COOLDOWN_MS);
  }, [isRescanningIsrc]);

  useEffect(() => {
    if (platformRescanCooldownEnd <= 0) {
      return;
    }

    const tick = () => {
      const remaining = platformRescanCooldownEnd - Date.now();
      if (remaining <= 0) {
        setPlatformRescanRemainingMs(0);
        setPlatformRescanCooldownEnd(0);
        if (platformRescanTimerRef.current) {
          clearInterval(platformRescanTimerRef.current);
        }
        return;
      }

      setPlatformRescanRemainingMs(remaining);
    };

    tick();
    platformRescanTimerRef.current = setInterval(tick, 1000);

    return () => {
      if (platformRescanTimerRef.current) {
        clearInterval(platformRescanTimerRef.current);
      }
    };
  }, [platformRescanCooldownEnd]);

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

  const handleCopyReleasePath = useCallback(
    async (path: string, label: string) => {
      const copied = await copyToClipboard(`${getBaseUrl()}${path}`);

      if (copied) {
        toast.success(`${label} copied`);
        return `${getBaseUrl()}${path}`;
      }

      toast.error(`Failed to copy ${label.toLowerCase()}`);
      return undefined;
    },
    []
  );

  const contextMenuItems = useMemo<CommonDropdownItem[]>(() => {
    if (!release) return [];

    const items = convertToCommonDropdownItems(
      buildReleaseActions({
        release,
        onEdit: () => {
          setActiveTab('dsps');
          setIsAddingLink(true);
        },
        onCopy: (path, label) => handleCopyReleasePath(path, label),
        artistName,
        canGenerateAlbumArt,
        onGenerateAlbumArt,
      })
    );

    return [
      ...items,
      {
        type: 'separator',
        id: 'release-sidebar-separator-refresh',
      },
      {
        type: 'action',
        id: 'refresh-release',
        label: isRefreshing ? 'Refreshing release…' : 'Refresh release',
        icon: <RefreshCw className='h-4 w-4' />,
        onClick: () => {
          if (isRefreshing) return;
          if (onRefresh) {
            onRefresh();
            return;
          }
          globalThis.location.reload();
        },
        disabled: isRefreshing,
      },
    ];
  }, [
    release,
    handleCopyReleasePath,
    artistName,
    canGenerateAlbumArt,
    onGenerateAlbumArt,
    isRefreshing,
    onRefresh,
    setIsAddingLink,
  ]);

  const { headerLabel } = useReleaseHeaderParts({
    release,
    hasRelease,
    onRefresh,
    isRefreshing,
  });

  const availablePlatformProviders = useMemo(() => {
    if (!release) {
      return [];
    }

    const providerKeys = Object.keys(providerConfig) as ProviderKey[];
    return providerKeys.filter(
      providerKey =>
        !release.providers.some(provider => provider.key === providerKey)
    );
  }, [providerConfig, release]);

  const isPlatformRescanCoolingDown = platformRescanRemainingMs > 0;
  const isPlatformRescanDisabled =
    !onRescanIsrc || isRescanningIsrc || isPlatformRescanCoolingDown;

  const releaseTabOptions = useMemo(() => {
    const options: Array<{ value: ReleaseSidebarTab; label: string }> = [
      { value: 'details' as const, label: 'Details' },
      { value: 'dsps' as const, label: 'DSPs' },
    ];

    if ((release?.totalTracks ?? 0) > 0) {
      options.push({ value: 'tracks' as const, label: 'Tracks' });
    }

    return options;
  }, [release?.totalTracks]);

  useEffect(() => {
    if (
      activeTab === 'tracks' &&
      !releaseTabOptions.some(option => option.value === 'tracks')
    ) {
      setActiveTab('details');
    }
  }, [activeTab, releaseTabOptions]);

  const handleOpenPlatformAddForm = useCallback(() => {
    if (!isEditable || availablePlatformProviders.length === 0) {
      return;
    }

    setActiveTab('dsps');
    setIsAddingLink(true);
  }, [
    availablePlatformProviders.length,
    isEditable,
    setActiveTab,
    setIsAddingLink,
  ]);

  const handlePlatformRescan = useCallback(() => {
    if (isPlatformRescanDisabled) {
      return;
    }

    onRescanIsrc?.();
  }, [isPlatformRescanDisabled, onRescanIsrc]);

  const platformCardActions = useMemo(() => {
    if (!isEditable) {
      return null;
    }

    const menuItems: CommonDropdownItem[] = onRescanIsrc
      ? [
          {
            type: 'action',
            id: 'refresh-platform-links',
            label: getPlatformRescanLabel({
              isRescanning: isRescanningIsrc,
              isCoolingDown: isPlatformRescanCoolingDown,
              remainingMs: platformRescanRemainingMs,
            }),
            icon: (
              <RefreshCw
                className={cn('h-4 w-4', isRescanningIsrc && 'animate-spin')}
              />
            ),
            onClick: handlePlatformRescan,
            disabled: isPlatformRescanDisabled,
          },
        ]
      : [];

    return (
      <DrawerSplitButton
        primaryAction={
          availablePlatformProviders.length > 0
            ? {
                ariaLabel: 'Add DSP link',
                testId: 'release-sidebar-add-dsp-link',
                icon: <Plus className='h-3.5 w-3.5' aria-hidden='true' />,
                onClick: handleOpenPlatformAddForm,
              }
            : undefined
        }
        menuItems={menuItems}
        menuAriaLabel='DSP actions'
      />
    );
  }, [
    availablePlatformProviders.length,
    handleOpenPlatformAddForm,
    handlePlatformRescan,
    isEditable,
    isPlatformRescanCoolingDown,
    isPlatformRescanDisabled,
    isRescanningIsrc,
    onRescanIsrc,
    platformRescanRemainingMs,
  ]);

  const shouldRenderTasks =
    isTasksWorkspaceGateLoading || canAccessTasksWorkspace || showTasksUpgrade;

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      width={width ?? 344}
      ariaLabel='Release details'
      scrollStrategy='shell'
      onKeyDown={handleKeyDown}
      contextMenuItems={contextMenuItems}
      data-testid='release-sidebar'
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeader={
        release ? (
          <ReleaseEntityHeader
            headerLabel={headerLabel}
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
            actionBar={
              <DrawerCardActionBar
                primaryActions={[]}
                menuItems={contextMenuItems}
                overflowTriggerIcon='vertical'
                onClose={onClose}
                className='border-0 bg-transparent px-0 py-0'
              />
            }
            footer={
              <ReleaseSmartLinkAnalytics
                release={release}
                analyticsOverride={analyticsOverride}
                artistName={artistName}
                variant='flat'
              />
            }
          />
        ) : undefined
      }
      isEmpty={!release}
      emptyMessage='Select a release in the table to view its details.'
    >
      {release && (
        <div className='space-y-2.5'>
          <DrawerTabbedCard
            testId='release-tabbed-card'
            tabs={
              <DrawerTabs
                value={activeTab}
                onValueChange={value =>
                  setActiveTab(value as ReleaseSidebarTab)
                }
                options={releaseTabOptions}
                ariaLabel='Release sidebar tabs'
                overflowMode='scroll'
                distribution='intrinsic'
              />
            }
            controls={activeTab === 'dsps' ? platformCardActions : undefined}
            contentClassName='pt-2'
          >
            {activeTab === 'details' ? (
              <ReleasePropertiesPanel
                release={release}
                showCredits={showCredits}
                isEditable={isEditable}
                onSaveMetadata={readOnly ? undefined : onSaveMetadata}
                onSavePrimaryIsrc={readOnly ? undefined : onSavePrimaryIsrc}
                onCanvasStatusChange={
                  canEditCanvasStatus ? handleCanvasStatusChange : undefined
                }
              />
            ) : null}

            {activeTab === 'dsps' ? (
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
                showHeading={false}
              />
            ) : null}

            {activeTab === 'tracks' ? (
              <ReleaseTrackList
                release={release}
                tracksOverride={tracksOverride}
              />
            ) : null}
          </DrawerTabbedCard>

          {shouldRenderTasks ? (
            <DrawerInspectorCard
              title='Tasks'
              defaultOpen={false}
              lazyMount
              data-testid='release-tasks-card'
              headingTestId='release-tasks-toggle'
            >
              {isTasksWorkspaceGateLoading ? (
                <div
                  className='animate-pulse px-1 py-1.5 text-[12px] text-secondary-token'
                  data-testid='release-tasks-loading-state'
                >
                  Loading tasks...
                </div>
              ) : null}
              {!isTasksWorkspaceGateLoading && canAccessTasksWorkspace ? (
                <ReleaseTaskChecklist
                  releaseId={release.id}
                  variant='compact'
                  releaseDate={release.releaseDate}
                  onNavigateToFullPage={() => {
                    globalThis.location.href =
                      APP_ROUTES.DASHBOARD_RELEASE_TASKS.replace(
                        '[releaseId]',
                        release.id
                      );
                  }}
                />
              ) : null}
              {!isTasksWorkspaceGateLoading &&
              !canAccessTasksWorkspace &&
              showTasksUpgrade ? (
                <CompactReleasePlanUpgradeCard
                  onDismiss={() => setShowTasksUpgrade(false)}
                />
              ) : null}
            </DrawerInspectorCard>
          ) : null}

          <DrawerSection
            title='Lyrics'
            surface='card'
            defaultOpen={false}
            lazyMount
            testId='release-lyrics-card'
            contentClassName='p-0'
          >
            <ReleaseLyricsSection
              releaseId={release.id}
              lyrics={release.lyrics}
              isEditable={isEditable}
              isSaving={isLyricsSaving}
              variant='flat'
              onSaveLyrics={onSaveLyrics}
              onFormatLyrics={onFormatLyrics}
            />
          </DrawerSection>

          <DrawerSection
            title='Extras'
            surface='card'
            defaultOpen={false}
            lazyMount
            testId='release-extras-card'
            contentClassName='space-y-3 p-3'
          >
            {isEditable ? (
              <ReleaseArtworkDownloadsSetting
                allowDownloads={allowDownloads}
                onToggleArtworkDownloads={onToggleArtworkDownloads}
              />
            ) : null}
            <ReleaseTargetPlaylistsSection
              key={release.id}
              releaseId={release.id}
              targetPlaylists={release.targetPlaylists}
              onSave={readOnly ? undefined : onSaveTargetPlaylists}
              readOnly={readOnly}
              variant='flat'
            />
            {!readOnly ? (
              <ReleasePitchSection
                releaseId={release.id}
                existingPitches={release.generatedPitches}
                variant='flat'
              />
            ) : null}
          </DrawerSection>
        </div>
      )}
    </EntitySidebarShell>
  );
}

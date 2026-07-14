'use client';

/**
 * ReleaseSidebar Component
 *
 * A sidebar component for displaying and editing release details,
 * including artwork, title, release date, and DSP links.
 */

import type { CommonDropdownItem } from '@jovie/ui';
import { Plus, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReleaseTaskChecklist } from '@/components/features/dashboard/release-tasks';
import { ReleaseAudioAssetPanel } from '@/components/features/release/ReleaseAudioAssetPanel';
import { toast } from '@/components/feedback';
import {
  DrawerCardActionBar,
  DrawerSection,
  DrawerSplitButton,
  DrawerTabbedCard,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { convertToCommonDropdownItems } from '@/components/organisms/table';
import { buildReleaseTasksRoute } from '@/constants/routes';
import { buildReleaseActions } from '@/features/dashboard/organisms/releases/release-actions';
import { CompactReleasePlanUpgradeCard } from '@/features/dashboard/tasks/TasksUpgradeInterstitial';
import { copyToClipboard } from '@/hooks/useClipboard';
import { openChatWithPrompt } from '@/lib/chat/open-chat-with-prompt';
import type { ProviderKey } from '@/lib/discography/types';
import { usePlanGate } from '@/lib/queries';
import type { CanvasStatus } from '@/lib/services/canvas/types';
import { buildReleasePitchChatPrompt } from '@/lib/services/pitch/targets';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { ReleaseDspLinks } from './ReleaseDspLinks';
import { ReleaseLyricsSection } from './ReleaseLyricsSection';
import { ReleasePropertiesPanel } from './ReleasePropertiesPanel';
import {
  ReleaseActivitySection,
  ReleaseArtworkDownloadsSetting,
  ReleaseEntityHeader,
} from './ReleaseSidebarSections';
import { ReleaseSmartLinkAnalytics } from './ReleaseSmartLinkAnalytics';
import { ReleaseTrackList } from './ReleaseTrackList';
import type { Release, ReleaseSidebarProps } from './types';
import { useReleaseSidebar } from './useReleaseSidebar';
import { useTrackAudioPlayer } from './useTrackAudioPlayer';

const PLATFORM_RESCAN_COOLDOWN_MS = 5 * 60 * 1000;

type ReleaseSidebarTab = 'overview' | 'dsps' | 'tasks';

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

export function ReleaseSidebar({
  release,
  mode,
  isOpen,
  width,
  providerConfig,
  artistName,
  onArtistClick,
  canGenerateAlbumArt,
  onGenerateAlbumArt,
  onGeneratePitch,
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
  designV1 = false,
  onTrackClick,
}: ReleaseSidebarProps) {
  const router = useRouter();
  const {
    isAddingLink,
    setIsAddingLink,
    newLinkUrl,
    setNewLinkUrl,
    selectedProvider,
    setSelectedProvider,
    isEditable: _isEditable,
    canUploadArtwork: _canUploadArtwork,
    canRevertArtwork: _canRevertArtwork,
    isAddingDspLink,
    isRemovingDspLink,
    dspLinkActionError,
    clearDspLinkActionError,
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
  const [activeTab, setActiveTab] = useState<ReleaseSidebarTab>('overview');
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
    setActiveTab('overview');
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
      hasLyrics: Boolean(release.lyrics?.trim()),
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

  const handleGeneratePitch = useCallback(
    (selectedRelease: Release) => {
      openChatWithPrompt(
        buildReleasePitchChatPrompt({
          releaseId: selectedRelease.id,
          releaseTitle: selectedRelease.title,
        }),
        router
      );
    },
    [router]
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
        onGeneratePitch: onGeneratePitch ?? handleGeneratePitch,
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
          router.refresh();
        },
        disabled: isRefreshing,
      },
    ];
  }, [
    release,
    handleCopyReleasePath,
    artistName,
    canGenerateAlbumArt,
    handleGeneratePitch,
    onGenerateAlbumArt,
    onGeneratePitch,
    isRefreshing,
    onRefresh,
    router,
    setIsAddingLink,
  ]);

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
      { value: 'overview' as const, label: 'Overview' },
      { value: 'dsps' as const, label: 'Links' },
      { value: 'tasks' as const, label: 'Tasks' },
    ];

    return options;
  }, []);

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

  const handleNavigateToFullTasksPage = useCallback(() => {
    if (!release) {
      return;
    }

    router.push(buildReleaseTasksRoute(release.id));
  }, [release, router]);

  const handleDismissTasksUpgrade = useCallback(() => {
    setShowTasksUpgrade(false);
  }, []);

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

  function renderTabContent() {
    if (!release) return null;

    if (activeTab === 'overview') {
      return (
        <div className='space-y-2.5'>
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
          {designV1 ? (
            <ReleaseActivitySection
              release={release}
              providerConfig={providerConfig}
            />
          ) : null}
          <DrawerSection
            title='Audio'
            surface='plain'
            defaultOpen
            testId='release-audio-card'
            contentClassName='space-y-3 p-3'
          >
            <ReleaseAudioAssetPanel
              releaseId={release.id}
              releaseTitle={release.title}
              previewUrl={release.previewUrl}
              durationMs={release.totalDurationMs}
              isEditable={isEditable}
              onUploaded={() => {
                router.refresh();
              }}
            />
          </DrawerSection>
          {isEditable ? (
            <DrawerSection
              title='Artwork'
              surface='plain'
              defaultOpen={false}
              lazyMount
              testId='release-artwork-settings-card'
              contentClassName='space-y-3 p-3'
            >
              <ReleaseArtworkDownloadsSetting
                allowDownloads={allowDownloads}
                onToggleArtworkDownloads={onToggleArtworkDownloads}
              />
            </DrawerSection>
          ) : null}
          <DrawerSection
            title='Lyrics'
            surface='plain'
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
          {(release.totalTracks ?? 0) > 0 ? (
            <DrawerSection
              title='Tracks'
              surface='plain'
              defaultOpen={false}
              lazyMount
              testId='release-tracks-card'
              contentClassName='p-0'
            >
              <ReleaseTrackList
                release={release}
                tracksOverride={tracksOverride}
                onTrackClick={onTrackClick}
              />
            </DrawerSection>
          ) : null}
        </div>
      );
    }

    if (activeTab === 'dsps') {
      return (
        <ReleaseDspLinks
          release={release}
          providerConfig={providerConfig}
          isEditable={isEditable}
          isAddingLink={isAddingLink}
          newLinkUrl={newLinkUrl}
          selectedProvider={selectedProvider}
          isAddingDspLink={isAddingDspLink}
          isRemovingDspLink={isRemovingDspLink}
          actionError={dspLinkActionError}
          onSetIsAddingLink={setIsAddingLink}
          onSetNewLinkUrl={setNewLinkUrl}
          onSetSelectedProvider={setSelectedProvider}
          onAddLink={handleAddLink}
          onRemoveLink={handleRemoveLink}
          onDismissActionError={clearDspLinkActionError}
          onNewLinkKeyDown={handleNewLinkKeyDown}
          showHeading={false}
        />
      );
    }

    if (activeTab === 'tasks') {
      return (
        <div data-testid='release-tasks-card'>
          {isTasksWorkspaceGateLoading ? (
            <div
              className='px-1 py-1.5'
              data-testid='release-tasks-loading-state'
            >
              <div
                className='h-3 w-24 rounded skeleton motion-reduce:animate-none'
                aria-hidden='true'
              />
            </div>
          ) : null}
          {!isTasksWorkspaceGateLoading && canAccessTasksWorkspace ? (
            <ReleaseTaskChecklist
              releaseId={release.id}
              variant='compact'
              releaseDate={release.releaseDate}
              onNavigateToFullPage={handleNavigateToFullTasksPage}
            />
          ) : null}
          {!isTasksWorkspaceGateLoading &&
          !canAccessTasksWorkspace &&
          showTasksUpgrade ? (
            <CompactReleasePlanUpgradeCard
              onDismiss={handleDismissTasksUpgrade}
            />
          ) : null}
        </div>
      );
    }

    return null;
  }

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
      entityHeaderSurface='flat'
      entityHeader={
        release ? (
          <ReleaseEntityHeader
            release={release}
            artistName={artistName}
            providerConfig={providerConfig}
            onArtistClick={onArtistClick}
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
                distribution='fill'
              />
            }
            controls={activeTab === 'dsps' ? platformCardActions : undefined}
            contentClassName='pt-2'
          >
            {renderTabContent()}
          </DrawerTabbedCard>
        </div>
      )}
    </EntitySidebarShell>
  );
}

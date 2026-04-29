'use client';

/**
 * ReleaseSidebar Component
 *
 * A sidebar component for displaying and editing release details,
 * including artwork, title, release date, and DSP links.
 */

import type { CommonDropdownItem } from '@jovie/ui';
import { Activity, Pause, Play, Plus, RefreshCw } from 'lucide-react';
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
  DrawerMediaThumb,
  DrawerSection,
  DrawerSplitButton,
  DrawerSurfaceCard,
  DrawerTabbedCard,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { convertToCommonDropdownItems } from '@/components/organisms/table';
import { DrawerHero } from '@/components/shell/DrawerHero';
import { DropDateChip } from '@/components/shell/DropDateChip';
import {
  type DspAvatarItem,
  DspAvatarStack,
  type DspStatus,
} from '@/components/shell/DspAvatarStack';
import { MetaPill } from '@/components/shell/MetaPill';
import {
  type ReleaseStatus,
  StatusBadge,
} from '@/components/shell/StatusBadge';
import { TypeBadge } from '@/components/shell/TypeBadge';
import { APP_ROUTES } from '@/constants/routes';
import { buildReleaseActions } from '@/features/dashboard/organisms/releases/release-actions';
import { CompactReleasePlanUpgradeCard } from '@/features/dashboard/tasks/TasksUpgradeInterstitial';
import {
  AlbumArtworkContextMenu,
  buildArtworkSizes,
} from '@/features/release/AlbumArtworkContextMenu';
import { copyToClipboard } from '@/hooks/useClipboard';
import type { ProviderConfidence, ProviderKey } from '@/lib/discography/types';
import { dropDateMeta } from '@/lib/format-drop-date';
import { usePlanGate } from '@/lib/queries';
import type { CanvasStatus } from '@/lib/services/canvas/types';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/date-formatting';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { ReleaseDspLinks } from './ReleaseDspLinks';
import { ReleaseLyricsSection } from './ReleaseLyricsSection';
import { ReleasePitchSection } from './ReleasePitchSection';
import { ReleasePropertiesPanel } from './ReleasePropertiesPanel';
import { ReleaseSmartLinkAnalytics } from './ReleaseSmartLinkAnalytics';
import { ReleaseTargetPlaylistsSection } from './ReleaseTargetPlaylistsSection';
import { ReleaseTrackList } from './ReleaseTrackList';
import type { Release, ReleaseSidebarProps } from './types';
import { useReleaseSidebar } from './useReleaseSidebar';
import { useTrackAudioPlayer } from './useTrackAudioPlayer';
import { isValidUrl } from './utils';

const RELEASE_SIDEBAR_CARD_CLASSNAME = 'overflow-hidden';
const PLATFORM_RESCAN_COOLDOWN_MS = 5 * 60 * 1000;

type ReleaseSidebarTab = 'overview' | 'dsps' | 'tasks' | 'pitch';

const RELEASE_TYPE_LABELS: Record<string, string> = {
  single: 'Single',
  ep: 'EP',
  album: 'Album',
  compilation: 'Compilation',
  live: 'Live',
  mixtape: 'Mixtape',
  music_video: 'Music Video',
  other: 'Other',
};

const PROVIDER_COLOR_CLASS: Partial<Record<ProviderKey, string>> = {
  spotify: 'bg-emerald-500/90',
  apple_music: 'bg-rose-400/90',
  youtube: 'bg-red-500/90',
  youtube_music: 'bg-red-500/90',
  soundcloud: 'bg-orange-400/90',
  deezer: 'bg-violet-400/90',
  tidal: 'bg-sky-400/90',
  amazon_music: 'bg-blue-400/90',
  bandcamp: 'bg-cyan-500/90',
  beatport: 'bg-lime-400/90',
  pandora: 'bg-blue-500/90',
  napster: 'bg-indigo-400/90',
  audiomack: 'bg-amber-400/90',
  qobuz: 'bg-yellow-500/90',
  anghami: 'bg-purple-400/90',
  boomplay: 'bg-teal-500/90',
  iheartradio: 'bg-red-600/90',
  tiktok: 'bg-fuchsia-400/90',
  amazon: 'bg-blue-400/90',
  awa: 'bg-pink-400/90',
  audius: 'bg-orange-500/90',
  flo: 'bg-cyan-400/90',
  gaana: 'bg-pink-500/90',
  jio_saavn: 'bg-green-500/90',
  joox: 'bg-emerald-400/90',
  kkbox: 'bg-blue-600/90',
  line_music: 'bg-green-400/90',
  netease: 'bg-red-400/90',
  qq_music: 'bg-green-600/90',
  trebel: 'bg-amber-500/90',
  yandex: 'bg-yellow-400/90',
};

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
  readonly release: Release;
  readonly artistName: string | null | undefined;
  readonly providerConfig: Record<
    ProviderKey,
    { label: string; accent: string }
  >;
  readonly onArtistClick?: (artistName: string) => void;
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

const releaseArtistListFormatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

function renderArtistLine(
  artistNames: string[] | undefined,
  fallbackArtistName: string | null | undefined,
  onArtistClick: ((artistName: string) => void) | undefined
): ReactNode {
  const normalizedNames = (artistNames ?? [])
    .map(name => name.trim())
    .filter(Boolean);

  if (normalizedNames.length === 0) {
    const fallback = fallbackArtistName?.trim();
    if (!fallback) return null;
    if (!onArtistClick) return fallback;
    return (
      <button
        type='button'
        onClick={() => onArtistClick(fallback)}
        className='rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-focus-ring)'
      >
        {fallback}
      </button>
    );
  }

  if (!onArtistClick) {
    return releaseArtistListFormatter.format(normalizedNames);
  }

  const partKeyCounts = new Map<string, number>();

  return releaseArtistListFormatter.formatToParts(normalizedNames).map(part => {
    const keyBase = `${part.type}:${part.value}`;
    const occurrence = (partKeyCounts.get(keyBase) ?? 0) + 1;
    partKeyCounts.set(keyBase, occurrence);
    const key = `${keyBase}:${occurrence}`;

    return part.type === 'element' ? (
      <button
        key={key}
        type='button'
        onClick={() => onArtistClick(part.value)}
        className='rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-focus-ring)'
      >
        {part.value}
      </button>
    ) : (
      <span key={key}>{part.value}</span>
    );
  });
}

function getReleaseTypeLabel(releaseType: string | undefined): string | null {
  if (!releaseType) return null;
  return RELEASE_TYPE_LABELS[releaseType] ?? releaseType;
}

function getShellReleaseStatus(release: Release): ReleaseStatus {
  if (release.deletedAt) return 'hidden';
  if (release.status === 'scheduled') return 'scheduled';
  if (release.status === 'draft') return 'draft';
  return 'live';
}

function getDspStatus({
  url,
  confidence,
}: {
  readonly url: string;
  readonly confidence?: ProviderConfidence;
}): DspStatus {
  if (!url || !isValidUrl(url)) return 'error';

  if (confidence === 'search_fallback' || confidence === 'unknown') {
    return 'pending';
  }

  return 'live';
}

function getProviderGlyph(label: string, fallback: string): string {
  return (label.match(/[a-z0-9]/iu)?.[0] ?? fallback[0] ?? '?').toUpperCase();
}

function getDspAvatarItems(
  release: Release,
  providerConfig: Record<ProviderKey, { label: string; accent: string }>
): DspAvatarItem[] {
  const linkedItems = release.providers.map(provider => {
    const label = providerConfig[provider.key]?.label || provider.label;
    return {
      id: provider.key,
      status: getDspStatus({
        url: provider.url,
        confidence: provider.confidence,
      }),
      label,
      glyph: getProviderGlyph(label, provider.key),
      colorClass: PROVIDER_COLOR_CLASS[provider.key] ?? 'bg-slate-500/90',
    };
  });

  const missingItems = (release.providerCounts?.unresolvedProviders ?? [])
    .filter(key => !release.providers.some(provider => provider.key === key))
    .map(key => {
      const label = providerConfig[key]?.label || key;
      return {
        id: key,
        status: 'missing' as const,
        label,
        glyph: getProviderGlyph(label, key),
        colorClass: PROVIDER_COLOR_CLASS[key] ?? 'bg-slate-500/90',
      };
    });

  return [...linkedItems, ...missingItems];
}

function ReleaseEntityHeader({
  release,
  artistName,
  providerConfig,
  onArtistClick,
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
  const artistLine = renderArtistLine(
    release.artistNames,
    artistName,
    onArtistClick
  );
  const hasActionBar = Boolean(actionBar);
  const releaseTypeLabel = getReleaseTypeLabel(release.releaseType);
  const releaseDate = release.releaseDate
    ? dropDateMeta(release.releaseDate)
    : null;
  const dspItems = getDspAvatarItems(release, providerConfig);
  const trackLabel =
    release.totalTracks > 0
      ? `${release.totalTracks} ${release.totalTracks === 1 ? 'Track' : 'Tracks'}`
      : null;

  return (
    <DrawerSurfaceCard
      variant='card'
      className={RELEASE_SIDEBAR_CARD_CLASSNAME}
      testId='release-header-card'
    >
      <div className='relative'>
        {hasActionBar ? (
          <div className='absolute right-2.5 top-2.5'>{actionBar}</div>
        ) : null}
        <DrawerHero
          title={release.title}
          subtitle={
            artistLine ? (
              <span className='line-clamp-2 block'>{artistLine}</span>
            ) : null
          }
          artwork={
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
          }
          meta={
            <>
              <StatusBadge status={getShellReleaseStatus(release)} />
              {releaseTypeLabel ? <TypeBadge label={releaseTypeLabel} /> : null}
              {releaseDate ? (
                <DropDateChip
                  tone={releaseDate.tone}
                  label={releaseDate.label}
                />
              ) : null}
              {trackLabel ? <MetaPill>{trackLabel}</MetaPill> : null}
              <DspAvatarStack dsps={dspItems} />
            </>
          }
          className={cn('pb-2.5', hasActionBar && '[&_h2]:pr-9')}
        />
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

function ReleaseActivitySection({
  release,
  providerConfig,
}: {
  readonly release: Release;
  readonly providerConfig: Record<
    ProviderKey,
    { label: string; accent: string }
  >;
}) {
  const activityRows = release.providers
    .map(provider => {
      if (!provider.updatedAt) return null;
      const label = providerConfig[provider.key]?.label || provider.label;
      return {
        providerKey: provider.key,
        label,
        updatedAt: provider.updatedAt,
        timestamp: new Date(provider.updatedAt).getTime(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter(row => Number.isFinite(row.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3);

  if (activityRows.length === 0) {
    return null;
  }

  return (
    <DrawerSection
      title='Activity'
      surface='plain'
      collapsible={false}
      testId='release-activity-card'
      contentClassName='p-0'
    >
      <div className='divide-y divide-(--linear-app-frame-seam)'>
        {activityRows.map(row => (
          <div
            key={`${row.providerKey}-${row.updatedAt}`}
            className='flex items-center gap-2.5 px-3 py-2.5'
          >
            <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-1 text-tertiary-token'>
              <Activity className='h-3 w-3' aria-hidden='true' />
            </span>
            <div className='min-w-0 flex-1'>
              <p className='truncate text-[12px] font-caption text-primary-token'>
                {row.label} Link updated
              </p>
              <p className='mt-0.5 text-[10.5px] text-tertiary-token'>
                {formatTimeAgo(row.updatedAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </DrawerSection>
  );
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
  designV1 = false,
}: ReleaseSidebarProps) {
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
      { value: 'pitch' as const, label: 'Pitch' },
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

    globalThis.location.href = APP_ROUTES.DASHBOARD_RELEASE_TASKS.replace(
      '[releaseId]',
      release.id
    );
  }, [release]);

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
          onSetIsAddingLink={setIsAddingLink}
          onSetNewLinkUrl={setNewLinkUrl}
          onSetSelectedProvider={setSelectedProvider}
          onAddLink={handleAddLink}
          onRemoveLink={handleRemoveLink}
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
              className='animate-pulse px-1 py-1.5 text-xs text-secondary-token'
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

    if (activeTab === 'pitch') {
      return (
        <div className='space-y-3' data-testid='release-pitch-tab'>
          <ReleaseTargetPlaylistsSection
            key={release.id}
            releaseId={release.id}
            targetPlaylists={release.targetPlaylists}
            onSave={readOnly ? undefined : onSaveTargetPlaylists}
            readOnly={readOnly}
            variant='flat'
          />
          {readOnly ? null : (
            <ReleasePitchSection
              releaseId={release.id}
              existingPitches={release.generatedPitches}
              variant='flat'
            />
          )}
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
                distribution='intrinsic'
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

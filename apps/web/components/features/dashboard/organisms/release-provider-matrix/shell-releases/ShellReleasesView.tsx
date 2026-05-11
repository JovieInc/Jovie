'use client';

import { useRouter } from 'next/navigation';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import {
  connectAppleMusicArtist,
  deleteRelease,
} from '@/app/app/(shell)/dashboard/releases/actions';
import { instantiateReleaseTasksFromCatalog } from '@/app/app/(shell)/dashboard/releases/catalog-task-actions';
import { instantiateReleaseTasks } from '@/app/app/(shell)/dashboard/releases/task-actions';
import { Icon } from '@/components/atoms/Icon';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import {
  DrawerButton,
  DrawerLoadingSkeleton,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { DialogLoadingSkeleton } from '@/components/organisms/DialogLoadingSkeleton';
import type { ReleaseSidebarProps } from '@/components/organisms/release-sidebar';
import { convertContextMenuItems } from '@/components/organisms/table';
import { PillSearch } from '@/components/shell/PillSearch';
import type {
  FilterField,
  FilterPill,
} from '@/components/shell/pill-search.types';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { useTableMeta } from '@/contexts/TableMetaContext';
import { buildReleaseActions } from '@/features/dashboard/organisms/releases/release-actions';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { openChatWithPrompt } from '@/lib/chat/open-chat-with-prompt';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { captureError } from '@/lib/error-tracking';
import { useCodeFlag } from '@/lib/feature-flags/client';
import { usePlanGate } from '@/lib/queries';
import type { ReleaseContext } from '@/lib/release-tasks/applicability';
import { cn } from '@/lib/utils';
import { useImportPolling } from '../hooks/useImportPolling';
import { NewReleaseHeaderAction } from '../NewReleaseHeaderAction';
import {
  restoreReleaseArtwork,
  uploadReleaseArtwork,
} from '../release-artwork-actions';
import { useReleaseProviderMatrix } from '../useReleaseProviderMatrix';
import { releaseStatusToShell } from './release-adapters';
import { ShellReleaseRow } from './ShellReleaseRow';

const ReleaseSidebar = lazy(() =>
  import('@/components/organisms/release-sidebar').then(m => ({
    default: m.ReleaseSidebar,
  }))
);

const AddReleaseSidebar = lazy(() =>
  import('../AddReleaseSidebar').then(m => ({
    default: m.AddReleaseSidebar,
  }))
);

const SpotifyConnectDialog = lazy(() =>
  import('../SpotifyConnectDialog').then(m => ({
    default: m.SpotifyConnectDialog,
  }))
);

const ArtistSearchCommandPalette = lazy(() =>
  import('@/components/organisms/artist-search-palette').then(m => ({
    default: m.ArtistSearchCommandPalette,
  }))
);

const ImportProgressBanner = lazy(() =>
  import('../ImportProgressBanner').then(m => ({
    default: m.ImportProgressBanner,
  }))
);

const AppleMusicSyncBanner = lazy(() =>
  import('../AppleMusicSyncBanner').then(m => ({
    default: m.AppleMusicSyncBanner,
  }))
);

const SmartLinkGateBanner = lazy(() =>
  import('../SmartLinkGateBanner').then(m => ({
    default: m.SmartLinkGateBanner,
  }))
);

const ReleasePlanWizard = lazy(() =>
  import('../ReleasePlanWizard').then(m => ({
    default: m.ReleasePlanWizard,
  }))
);

const RELEASE_DETAIL_PANEL_WIDTH = 388;
/** Soft cap: show a "request higher limit" banner (not a hard lock) */
const SMART_LINK_SOFT_CAP = 100;

/**
 * Match a release against a single filter value. Field-level operator
 * (`is`/`is not`) is applied by the caller; this returns whether the value
 * matches at all. Production data drops the `album` and `bpm`/`key` fields
 * (those are sandbox-only); we mirror the shell-v1 set otherwise.
 */
function releaseMatchesField(
  release: ReleaseViewModel,
  field: FilterField,
  value: string
): boolean {
  const v = value.toLowerCase();
  switch (field) {
    case 'artist':
      return (release.artistNames ?? []).some(name =>
        name.toLowerCase().includes(v)
      );
    case 'title':
      return release.title.toLowerCase().includes(v);
    case 'album':
      return release.title.toLowerCase().includes(v);
    case 'status':
      return releaseStatusToShell(release.status) === value;
    case 'has':
      if (value === 'video') return Boolean(release.hasVideoLinks);
      if (value === 'canvas') {
        const status = release.canvasStatus;
        return status === 'generated' || status === 'uploaded';
      }
      return false;
  }
}

/**
 * Apply the pill list to a release. Pills are AND-combined across fields;
 * values within a single pill are OR-combined; the `op` flips the match.
 */
function applyPills(
  releases: readonly ReleaseViewModel[],
  pills: readonly FilterPill[]
): ReleaseViewModel[] {
  if (pills.length === 0) return [...releases];
  return releases.filter(r =>
    pills.every(pill => {
      const anyValueMatches = pill.values.some(v =>
        releaseMatchesField(r, pill.field, v)
      );
      return pill.op === 'is' ? anyValueMatches : !anyValueMatches;
    })
  );
}

function distinctValues(
  releases: readonly ReleaseViewModel[],
  pick: (r: ReleaseViewModel) => string | string[] | undefined
): string[] {
  const seen = new Set<string>();
  for (const r of releases) {
    const picked = pick(r);
    if (Array.isArray(picked)) {
      for (const v of picked) if (v) seen.add(v);
    } else if (picked) {
      seen.add(picked);
    }
    if (seen.size >= 200) break;
  }
  return [...seen];
}

export interface ShellReleasesViewProps {
  readonly releases: readonly ReleaseViewModel[];
  readonly providerConfig: Record<
    ProviderKey,
    { readonly label: string; readonly accent: string }
  >;
  readonly primaryProviders: ProviderKey[];
  readonly artistName?: string | null;
  readonly allowArtworkDownloads?: boolean;
  readonly spotifyConnected?: boolean;
  readonly appleMusicConnected?: boolean;
  readonly initialImporting?: boolean;
  readonly initialTotalCount?: number;
}

/**
 * Top-level Linear-style releases view, rendered behind DESIGN_V1.
 *
 * Restores parity with the production `ReleaseProviderMatrix` (create / sync /
 * import progress / Apple Music sync / soft-cap gates / smart-link locks)
 * while keeping the shell-style row list, PillSearch header, and production
 * release drawer.
 */
export function ShellReleasesView({
  releases,
  providerConfig,
  primaryProviders,
  artistName: initialArtistName,
  allowArtworkDownloads = false,
  spotifyConnected = false,
  appleMusicConnected = false,
  initialImporting = false,
  initialTotalCount = 0,
}: ShellReleasesViewProps) {
  const router = useRouter();
  const { setHeaderActions } = useSetHeaderActions();
  const albumArtFlagEnabled = useCodeFlag('ALBUM_ART_GENERATION');

  const [searchOpen, setSearchOpen] = useState(false);
  const [pills, setPills] = useState<FilterPill[]>([]);
  const [isConnected, setIsConnected] = useState(spotifyConnected);
  const [artistName, setArtistName] = useState<string | null>(
    initialArtistName ?? null
  );
  const [isImporting, setIsImporting] = useState(initialImporting);
  const [spotifySearchOpen, setSpotifySearchOpen] = useState(false);
  const [addReleaseOpen, setAddReleaseOpen] = useState(false);
  const [isAmConnected, setIsAmConnected] = useState(appleMusicConnected);
  const [amPaletteOpen, setAmPaletteOpen] = useState(false);
  const [postCreateRelease, setPostCreateRelease] =
    useState<ReleaseViewModel | null>(null);
  const [isPostCreatePlanModalOpen, setIsPostCreatePlanModalOpen] =
    useState(false);
  const [isGeneratingReleasePlan, setIsGeneratingReleasePlan] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReleaseViewModel | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const releaseRows = useMemo(() => [...releases], [releases]);
  const {
    rows,
    setRows,
    editingRelease,
    isSaving,
    isSyncing,
    handleReleaseCreated,
    handleReleaseArtworkUploaded,
    openEditor,
    closeEditor,
    updateRow,
    handleCopy,
    handleSync,
    handleRefreshRelease,
    refreshingReleaseId,
    handleRescanIsrc,
    isRescanningIsrc,
    handleCanvasStatusUpdate,
    handleAddUrl,
    handleSaveMetadata,
    handleSavePrimaryIsrc,
    handleSaveLyrics,
    handleSaveTargetPlaylists,
    handleFormatLyrics,
    isLyricsSaving,
  } = useReleaseProviderMatrix({
    releases: releaseRows,
    providerConfig,
    primaryProviders,
  });

  const planGate = usePlanGate();
  const {
    smartLinksLimit,
    isPro,
    canCreateManualReleases,
    canGenerateAlbumArt,
    canGenerateReleasePlans,
    canEditSmartLinks,
    canAccessFutureReleases,
  } = planGate;
  const isReleasePlanGateLoading = planGate.isLoading || planGate.isError;
  const showGenerateAlbumArtAction =
    albumArtFlagEnabled && Boolean(canGenerateAlbumArt);

  // Smart-link gating: partition releases by released/scheduled + apply cap.
  const { unlockedIds, lockReasons, releasedCount, unreleasedCount } =
    useMemo(() => {
      const now = Date.now();
      const released: ReleaseViewModel[] = [];
      const unreleased: ReleaseViewModel[] = [];
      const reasons = new Map<string, 'scheduled' | 'cap'>();

      for (const r of rows) {
        const releaseTime = r.releaseDate
          ? new Date(r.releaseDate).getTime()
          : 0;
        if (releaseTime > now) {
          unreleased.push(r);
          if (!canAccessFutureReleases) {
            reasons.set(r.id, 'scheduled');
          }
        } else {
          released.push(r);
        }
      }

      if (!smartLinksLimit) {
        return {
          unlockedIds: canAccessFutureReleases
            ? null
            : new Set(released.map(r => r.id)),
          lockReasons: reasons,
          releasedCount: released.length,
          unreleasedCount: unreleased.length,
        };
      }

      const sorted = [...released].sort((a, b) => {
        const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
        const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
        return dateA - dateB;
      });
      const allowed = sorted.slice(0, smartLinksLimit);
      const ids = new Set(allowed.map(r => r.id));

      for (const r of sorted.slice(smartLinksLimit)) {
        reasons.set(r.id, 'cap');
      }

      return {
        unlockedIds: ids,
        lockReasons: reasons,
        releasedCount: released.length,
        unreleasedCount: unreleased.length,
      };
    }, [rows, smartLinksLimit, canAccessFutureReleases]);

  const isSmartLinkLocked = useCallback(
    (releaseId: string) => {
      if (!unlockedIds) return false;
      return !unlockedIds.has(releaseId);
    },
    [unlockedIds]
  );

  const getSmartLinkLockReason = useCallback(
    (releaseId: string): 'scheduled' | 'cap' | null => {
      return lockReasons.get(releaseId) ?? null;
    },
    [lockReasons]
  );

  const visibleReleases = useMemo(() => applyPills(rows, pills), [rows, pills]);

  const artistOptions = useMemo(
    () => distinctValues(rows, r => r.artistNames),
    [rows]
  );
  const titleOptions = useMemo(
    () => distinctValues(rows, r => r.title),
    [rows]
  );
  const albumOptions = titleOptions;

  const handleSelect = useCallback(
    (release: ReleaseViewModel) => {
      openEditor(release);
    },
    [openEditor]
  );

  const handleArtworkUpload = uploadReleaseArtwork;
  const handleArtworkRevert = restoreReleaseArtwork;

  const handleGenerateAlbumArt = useCallback(
    (release: ReleaseViewModel) => {
      openChatWithPrompt(
        `Generate album art for this release and attach it to the provided release ID.\n${JSON.stringify(
          {
            releaseId: release.id,
            releaseTitle: release.title,
            instruction: 'Show three options.',
          }
        )}`,
        router
      );
    },
    [router]
  );

  const isDistributed = useCallback((release: ReleaseViewModel) => {
    return (
      !!release.primaryIsrc &&
      !!release.releaseDate &&
      new Date(release.releaseDate) <= new Date()
    );
  }, []);

  const handleDeleteRequest = useCallback(
    (releaseId: string) => {
      const release = rows.find(r => r.id === releaseId);
      if (release) {
        setDeleteTarget(release);
      }
    },
    [rows]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const result = await deleteRelease({ releaseId: deleteTarget.id });
      if (result.success) {
        setRows(prev => prev.filter(r => r.id !== deleteTarget.id));
        toast.success(`"${deleteTarget.title}" deleted.`);
      } else {
        toast.error(result.message ?? 'Failed to delete release.');
      }
    } catch {
      toast.error('Failed to delete release.');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, setRows]);

  const actionMenusByReleaseId = useMemo(() => {
    return new Map(
      visibleReleases.map(release => [
        release.id,
        convertContextMenuItems(
          buildReleaseActions({
            release,
            onEdit: openEditor,
            onCopy: handleCopy,
            artistName,
            isSmartLinkLocked,
            getSmartLinkLockReason,
            onDelete: handleDeleteRequest,
            canGenerateAlbumArt: showGenerateAlbumArtAction,
            onGenerateAlbumArt: handleGenerateAlbumArt,
          })
        ),
      ])
    );
  }, [
    artistName,
    getSmartLinkLockReason,
    handleCopy,
    handleDeleteRequest,
    handleGenerateAlbumArt,
    isSmartLinkLocked,
    openEditor,
    showGenerateAlbumArtAction,
    visibleReleases,
  ]);

  // ── Spotify connect / import wiring ──

  const handleArtistConnected = useCallback(
    (newReleases: ReleaseViewModel[], newArtistName: string) => {
      setIsConnected(true);
      setArtistName(newArtistName);
      if (newReleases.length > 0) {
        setRows(newReleases);
        setIsImporting(false);
      }
    },
    [setRows]
  );

  const handleImportStart = useCallback((importingArtistName: string) => {
    setIsImporting(true);
    setArtistName(importingArtistName);
  }, []);

  const handleReleasesFromPolling = useCallback(
    (polledReleases: ReleaseViewModel[]) => {
      setRows(polledReleases);
    },
    [setRows]
  );

  const handleImportComplete = useCallback(() => {
    setIsImporting(false);
  }, []);

  const { importedCount, totalCount } = useImportPolling({
    enabled: isImporting,
    initialTotalCount,
    onReleasesUpdate: handleReleasesFromPolling,
    onImportComplete: handleImportComplete,
  });

  const handleAppleMusicConnect = useCallback(
    async (artist: {
      id: string;
      name: string;
      url: string;
      imageUrl?: string;
    }) => {
      try {
        const result = await connectAppleMusicArtist({
          externalArtistId: artist.id,
          externalArtistName: artist.name,
          externalArtistUrl: artist.url,
          externalArtistImageUrl: artist.imageUrl,
        });
        if (result.success) {
          setIsAmConnected(true);
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to connect Apple Music'
        );
      }
    },
    []
  );

  const handleMatchStatusChange = useCallback(
    (connected: boolean, _name: string | null) => {
      setIsAmConnected(connected);
    },
    []
  );

  // ── New-release affordance (sync / add manually) ──

  const handleNewRelease = useCallback(() => {
    closeEditor();
    setAddReleaseOpen(true);
  }, [closeEditor]);

  const closeAddRelease = useCallback(() => setAddReleaseOpen(false), []);

  const handleAddReleaseCreated = useCallback(
    (createdRelease: ReleaseViewModel) => {
      handleReleaseCreated(createdRelease, { openEditor: false });
      setAddReleaseOpen(false);
      closeEditor();
      setPostCreateRelease(createdRelease);
      setIsPostCreatePlanModalOpen(true);
    },
    [closeEditor, handleReleaseCreated]
  );

  const closePostCreatePlanModal = useCallback(() => {
    if (isGeneratingReleasePlan) {
      return;
    }

    setIsPostCreatePlanModalOpen(false);
    setPostCreateRelease(null);
  }, [isGeneratingReleasePlan]);

  const handleGenerateReleasePlan = useCallback(
    async (ctx?: ReleaseContext) => {
      if (!postCreateRelease || isGeneratingReleasePlan) {
        return;
      }

      setIsGeneratingReleasePlan(true);
      try {
        if (ctx) {
          await instantiateReleaseTasksFromCatalog(postCreateRelease.id, ctx);
        } else {
          await instantiateReleaseTasks(postCreateRelease.id);
        }
        const releaseTasksPath = APP_ROUTES.DASHBOARD_RELEASE_TASKS.replace(
          '[releaseId]',
          postCreateRelease.id
        );
        setIsPostCreatePlanModalOpen(false);
        setPostCreateRelease(null);
        router.push(releaseTasksPath);
      } catch (error) {
        captureError('Failed to generate release plan', error, {
          context: 'shell-releases-view',
          releaseId: postCreateRelease.id,
          action: 'generate-release-plan',
        });
        toast.error('Failed to generate the release plan. Try again.');
      } finally {
        setIsGeneratingReleasePlan(false);
      }
    },
    [isGeneratingReleasePlan, postCreateRelease, router]
  );

  // ── Sidebar / right-panel registration ──

  const handleReleaseChange = useCallback(
    (updated: ReleaseViewModel) => {
      updateRow(updated);
    },
    [updateRow]
  );

  const isReleaseSidebarOpen = Boolean(editingRelease);
  const isSidebarOpen = isReleaseSidebarOpen || addReleaseOpen;

  const sidebarPanel = useMemo(() => {
    if (!isReleaseSidebarOpen) {
      if (addReleaseOpen && canCreateManualReleases) {
        return (
          <Suspense
            fallback={
              <DrawerLoadingSkeleton
                ariaLabel='Loading add release form'
                width={RELEASE_DETAIL_PANEL_WIDTH}
                showTabs={false}
                contentRows={6}
              />
            }
          >
            <AddReleaseSidebar
              isOpen={addReleaseOpen}
              artistName={artistName}
              onClose={closeAddRelease}
              onCreated={handleAddReleaseCreated}
              onArtworkUploaded={handleReleaseArtworkUploaded}
            />
          </Suspense>
        );
      }
      return null;
    }

    const releaseSidebarProps: ReleaseSidebarProps = {
      release: editingRelease,
      mode: 'admin',
      isOpen: true,
      width: RELEASE_DETAIL_PANEL_WIDTH,
      providerConfig,
      artistName,
      onClose: closeEditor,
      onRefresh: editingRelease
        ? () => handleRefreshRelease(editingRelease.id)
        : undefined,
      isRefreshing: refreshingReleaseId === editingRelease?.id,
      onAddDspLink: handleAddUrl,
      onRescanIsrc: editingRelease
        ? () => handleRescanIsrc(editingRelease.id)
        : undefined,
      isRescanningIsrc,
      onArtworkUpload: handleArtworkUpload,
      onArtworkRevert: handleArtworkRevert,
      onReleaseChange: handleReleaseChange,
      onSaveMetadata: handleSaveMetadata,
      onSavePrimaryIsrc: handleSavePrimaryIsrc,
      onSaveLyrics: handleSaveLyrics,
      onSaveTargetPlaylists: handleSaveTargetPlaylists,
      onFormatLyrics: handleFormatLyrics,
      isLyricsSaving,
      isSaving,
      allowDownloads: allowArtworkDownloads,
      readOnly: !canEditSmartLinks,
      canGenerateAlbumArt: showGenerateAlbumArtAction,
      onGenerateAlbumArt: handleGenerateAlbumArt,
      showCredits: true,
      designV1: true,
      onCanvasStatusUpdate: handleCanvasStatusUpdate,
    };

    return (
      <Suspense
        fallback={
          <DrawerLoadingSkeleton
            ariaLabel='Loading release details'
            width={RELEASE_DETAIL_PANEL_WIDTH}
            showTabs
            contentRows={6}
          />
        }
      >
        <ReleaseSidebar {...releaseSidebarProps} />
      </Suspense>
    );
  }, [
    addReleaseOpen,
    allowArtworkDownloads,
    artistName,
    canCreateManualReleases,
    canEditSmartLinks,
    closeAddRelease,
    closeEditor,
    editingRelease,
    handleAddReleaseCreated,
    handleAddUrl,
    handleArtworkRevert,
    handleArtworkUpload,
    handleCanvasStatusUpdate,
    handleFormatLyrics,
    handleGenerateAlbumArt,
    handleRefreshRelease,
    handleReleaseArtworkUploaded,
    handleReleaseChange,
    handleRescanIsrc,
    handleSaveLyrics,
    handleSaveMetadata,
    handleSavePrimaryIsrc,
    handleSaveTargetPlaylists,
    isLyricsSaving,
    isReleaseSidebarOpen,
    isRescanningIsrc,
    isSaving,
    providerConfig,
    refreshingReleaseId,
    showGenerateAlbumArtAction,
  ]);

  useRegisterRightPanel(sidebarPanel);

  // ── Header actions: NewReleaseHeaderAction + search trigger / PillSearch ──

  const selectedReleaseId = editingRelease?.id ?? null;
  const releaseCountSuffix =
    visibleReleases.length === rows.length ? '' : ` of ${rows.length}`;

  const handleClearFilters = useCallback(() => {
    setPills([]);
  }, []);

  const headerActions = useMemo(() => {
    const searchNode = searchOpen ? (
      <div className='w-[min(560px,calc(100vw-2rem))] rounded-lg border border-(--linear-app-shell-border) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))] px-2 py-1 shadow-[0_10px_32px_rgba(0,0,0,0.16)] sm:w-[440px] lg:w-[520px]'>
        <PillSearch
          active={searchOpen}
          pills={pills}
          onPillsChange={setPills}
          artistOptions={artistOptions}
          titleOptions={titleOptions}
          albumOptions={albumOptions}
          ariaLabel='Filter releases'
          placeholder='Filter releases — / for fields'
          onClose={() => {
            setSearchOpen(false);
            setPills([]);
          }}
        />
      </div>
    ) : (
      <button
        type='button'
        data-app-search-trigger='true'
        onClick={() => setSearchOpen(true)}
        className='inline-flex h-7 items-center gap-1.5 rounded-md border border-(--linear-app-shell-border) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_94%,transparent)] px-2 text-[12px] text-secondary-token transition-[background-color,border-color,color] duration-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
        aria-label='Search releases'
      >
        <Icon name='Search' className='h-3.5 w-3.5' aria-hidden='true' />
        <span className='hidden sm:inline'>Search Releases</span>
        <span className='tabular-nums text-tertiary-token'>
          {visibleReleases.length}
          {releaseCountSuffix}
        </span>
      </button>
    );

    return (
      <div className='flex items-center gap-2'>
        {searchNode}
        <NewReleaseHeaderAction
          canCreateManualReleases={canCreateManualReleases}
          isSyncing={isSyncing}
          onSyncSpotify={handleSync}
          onCreateManual={handleNewRelease}
        />
      </div>
    );
  }, [
    albumOptions,
    artistOptions,
    canCreateManualReleases,
    handleNewRelease,
    handleSync,
    isSyncing,
    pills,
    releaseCountSuffix,
    searchOpen,
    titleOptions,
    visibleReleases.length,
  ]);

  useEffect(() => {
    setHeaderActions(headerActions);
    return () => setHeaderActions(null);
  }, [headerActions, setHeaderActions]);

  // ── Drawer toggle integration with table chrome (parity with production) ──

  const { setTableMeta } = useTableMeta();
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    const toggle = () => {
      if (editingRelease) {
        closeEditor();
      } else if (rowsRef.current.length > 0) {
        openEditor(rowsRef.current[0]);
      }
    };

    setTableMeta({
      rowCount: rows.length,
      toggle: rows.length > 0 ? toggle : null,
      rightPanelWidth: isSidebarOpen ? RELEASE_DETAIL_PANEL_WIDTH : 0,
    });
  }, [
    closeEditor,
    editingRelease,
    isSidebarOpen,
    openEditor,
    rows.length,
    setTableMeta,
  ]);

  // ── Conditional state surfaces ──

  const showImportProgress = isImporting;
  const showEmptyState = !isConnected && !isImporting && rows.length === 0;
  const showConnectedEmptyState =
    isConnected && rows.length === 0 && !isImporting;

  return (
    <>
      <section
        aria-label='Releases'
        className='flex h-full flex-col focus:outline-none'
        data-design-v1-releases='true'
        data-testid='shell-releases-view'
      >
        {showImportProgress && (
          <div className='mx-3 lg:mx-4 mt-3'>
            <Suspense fallback={null}>
              <ImportProgressBanner
                artistName={artistName}
                importedCount={importedCount}
                totalCount={totalCount}
                visible={showImportProgress}
              />
            </Suspense>
          </div>
        )}

        {rows.length > 0 &&
          rows[0]?.profileId &&
          !isAmConnected &&
          !isImporting && (
            <Suspense fallback={null}>
              <AppleMusicSyncBanner
                profileId={rows[0].profileId}
                spotifyConnected={isConnected}
                releases={rows}
                onMatchStatusChange={handleMatchStatusChange}
                className='mx-3 lg:mx-4 mt-3'
              />
            </Suspense>
          )}

        {rows.length > 0 && !isPro && releasedCount > SMART_LINK_SOFT_CAP && (
          <Suspense fallback={null}>
            <SmartLinkGateBanner
              mode='soft-cap'
              releasedCount={releasedCount}
              softCap={SMART_LINK_SOFT_CAP}
              className='mx-3 lg:mx-4 mt-3'
            />
          </Suspense>
        )}

        {rows.length > 0 &&
          !isPro &&
          !canAccessFutureReleases &&
          unreleasedCount > 0 && (
            <Suspense fallback={null}>
              <SmartLinkGateBanner
                mode='unreleased'
                unreleasedCount={unreleasedCount}
                className='mx-3 lg:mx-4 mt-3'
              />
            </Suspense>
          )}

        <div className='flex-1 min-h-0 overflow-y-auto'>
          {showEmptyState ? (
            <div className='py-12 grid place-items-center text-center'>
              <div className='max-w-sm'>
                <div className='text-[13px] font-caption text-primary-token'>
                  Connect Spotify to get started
                </div>
                <p className='mt-1 text-[12px] text-tertiary-token leading-[1.5]'>
                  Sync your catalog from Spotify or add a release manually to
                  start generating smart links.
                </p>
                <div className='mt-3 flex flex-wrap items-center justify-center gap-2'>
                  <DrawerButton
                    tone='primary'
                    onClick={() => setSpotifySearchOpen(true)}
                    className='h-7 rounded-lg px-2.5 text-2xs inline-flex items-center gap-2'
                    data-testid='shell-releases-connect-spotify'
                  >
                    <Icon
                      name='RefreshCw'
                      className='h-4 w-4'
                      aria-hidden='true'
                    />
                    Connect Spotify
                  </DrawerButton>
                  {canCreateManualReleases && (
                    <DrawerButton
                      onClick={handleNewRelease}
                      className='h-7 rounded-lg px-2.5 text-2xs inline-flex items-center gap-2'
                      data-testid='shell-releases-create-empty'
                    >
                      <Icon
                        name='Plus'
                        className='h-4 w-4'
                        aria-hidden='true'
                      />
                      Add manually
                    </DrawerButton>
                  )}
                </div>
              </div>
            </div>
          ) : showConnectedEmptyState ? (
            <div className='py-12 grid place-items-center text-center'>
              <DrawerSurfaceCard
                variant='card'
                className='flex min-h-[212px] flex-col items-center justify-center px-5 py-9 text-center'
                testId='shell-releases-empty-state-connected'
              >
                <div className='mb-2.5 flex h-9 w-9 items-center justify-center rounded-[10px] border border-subtle bg-surface-1'>
                  <Icon
                    name='Disc3'
                    className='h-4 w-4 text-tertiary-token'
                    aria-hidden='true'
                  />
                </div>
                <h3 className='text-app font-caption text-primary-token'>
                  No releases yet
                </h3>
                <p className='mt-0.5 max-w-sm text-xs leading-[17px] text-secondary-token'>
                  {canCreateManualReleases
                    ? 'Sync from Spotify or create one manually to start generating smart links.'
                    : 'Sync from Spotify to start generating smart links.'}
                </p>
                <div className='mt-3 flex flex-wrap items-center justify-center gap-2.5'>
                  <DrawerButton
                    tone='primary'
                    disabled={isSyncing}
                    onClick={handleSync}
                    className='h-7 rounded-lg px-2.5 text-2xs inline-flex items-center gap-2'
                    data-testid='shell-releases-sync-empty-state'
                  >
                    <Icon
                      name={isSyncing ? 'Loader2' : 'RefreshCw'}
                      className={cn(
                        'h-4 w-4',
                        isSyncing && 'animate-spin motion-reduce:animate-none'
                      )}
                      aria-hidden='true'
                    />
                    {isSyncing ? 'Syncing...' : 'Sync from Spotify'}
                  </DrawerButton>
                  {canCreateManualReleases && (
                    <DrawerButton
                      onClick={handleNewRelease}
                      className='h-7 rounded-lg px-2.5 text-2xs inline-flex items-center gap-2'
                      data-testid='shell-releases-create-connected-empty'
                    >
                      <Icon
                        name='Plus'
                        className='h-4 w-4'
                        aria-hidden='true'
                      />
                      Add manually
                    </DrawerButton>
                  )}
                </div>
              </DrawerSurfaceCard>
            </div>
          ) : visibleReleases.length === 0 ? (
            <div className='py-12 grid place-items-center text-center'>
              <div>
                <div className='text-[13px] font-caption text-secondary-token'>
                  No releases match your filters
                </div>
                {pills.length > 0 ? (
                  <button
                    type='button'
                    onClick={handleClearFilters}
                    className='mt-2 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors duration-subtle ease-out'
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div
              role='listbox'
              aria-label='Releases'
              className='py-1.5 space-y-px px-2'
            >
              {visibleReleases.map(r => (
                <ShellReleaseRow
                  key={r.id}
                  release={r}
                  isSelected={r.id === selectedReleaseId}
                  onSelect={() => handleSelect(r)}
                  actionMenuItems={actionMenusByReleaseId.get(r.id)}
                  smartLinkLockReason={
                    isSmartLinkLocked(r.id)
                      ? getSmartLinkLockReason(r.id)
                      : null
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

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
            onArtistSelect={handleAppleMusicConnect}
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
          onConnected={handleArtistConnected}
          onImportStart={handleImportStart}
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
            onSubmit={handleGenerateReleasePlan}
          />
        ) : null}
      </Suspense>

      {deleteTarget && (
        <ConfirmDialog
          open
          onOpenChange={open => {
            if (!open) setDeleteTarget(null);
          }}
          title={
            isDistributed(deleteTarget)
              ? 'Release is distributed'
              : `Delete "${deleteTarget.title}"?`
          }
          description={
            isDistributed(deleteTarget)
              ? 'Remove this release from distribution before deleting it.'
              : 'This will remove the release from your dashboard and public profile.'
          }
          confirmLabel={isDistributed(deleteTarget) ? 'OK' : 'Delete'}
          variant={isDistributed(deleteTarget) ? 'default' : 'destructive'}
          isLoading={isDeleting}
          onConfirm={
            isDistributed(deleteTarget)
              ? () => setDeleteTarget(null)
              : handleDeleteConfirm
          }
        />
      )}
    </>
  );
}

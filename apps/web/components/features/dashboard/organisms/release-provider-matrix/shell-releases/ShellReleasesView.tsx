'use client';

import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { DrawerLoadingSkeleton } from '@/components/molecules/drawer';
import type { ReleaseSidebarProps } from '@/components/organisms/release-sidebar';
import { convertContextMenuItems } from '@/components/organisms/table';
import { PillSearch } from '@/components/shell/PillSearch';
import type {
  FilterField,
  FilterPill,
} from '@/components/shell/pill-search.types';
import { buildReleaseActions } from '@/features/dashboard/organisms/releases/release-actions';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
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

const RELEASE_DETAIL_PANEL_WIDTH = 388;

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
      // Production model treats each release as the album-level entity.
      // Match against title so artists searching by album name still find it.
      return release.title.toLowerCase().includes(v);
    case 'status':
      return releaseStatusToShell(release.status) === value;
    case 'has':
      // 'video' = release has any short-form video provider links wired.
      // 'canvas' = release has Spotify Canvas attached.
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

/**
 * Distinct value lists fed to PillSearch's slash-menu suggestions. Cap at
 * a sane size so the suggestion popover stays scannable on artists with
 * deep catalogs.
 */
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

/**
 * Top-level Linear-style releases view, rendered behind DESIGN_V1.
 *
 * Replaces the legacy `ReleasesExperience` provider matrix with a shell-row
 * list, PillSearch header, row actions, and the production release drawer.
 */
export function ShellReleasesView({
  releases,
  providerConfig,
  primaryProviders,
  artistName,
  allowArtworkDownloads = false,
}: {
  readonly releases: readonly ReleaseViewModel[];
  readonly providerConfig: Record<
    ProviderKey,
    { readonly label: string; readonly accent: string }
  >;
  readonly primaryProviders: ProviderKey[];
  readonly artistName?: string | null;
  readonly allowArtworkDownloads?: boolean;
}) {
  const [searchOpen, setSearchOpen] = useState(true);
  const [pills, setPills] = useState<FilterPill[]>([]);
  const releaseRows = useMemo(() => [...releases], [releases]);
  const {
    rows,
    editingRelease,
    isSaving,
    openEditor,
    closeEditor,
    updateRow,
    handleCopy,
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

  const visibleReleases = useMemo(() => applyPills(rows, pills), [rows, pills]);

  const artistOptions = useMemo(
    () => distinctValues(rows, r => r.artistNames),
    [rows]
  );
  const titleOptions = useMemo(
    () => distinctValues(rows, r => r.title),
    [rows]
  );
  const albumOptions = titleOptions; // production has no separate album field

  const handleSelect = useCallback(
    (release: ReleaseViewModel) => {
      openEditor(release);
    },
    [openEditor]
  );

  const handleArtworkUpload = uploadReleaseArtwork;
  const handleArtworkRevert = restoreReleaseArtwork;

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
          })
        ),
      ])
    );
  }, [artistName, handleCopy, openEditor, visibleReleases]);

  const sidebarPanel = useMemo(() => {
    if (!editingRelease) {
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
      onRefresh: () => handleRefreshRelease(editingRelease.id),
      isRefreshing: refreshingReleaseId === editingRelease.id,
      onAddDspLink: handleAddUrl,
      onRescanIsrc: () => handleRescanIsrc(editingRelease.id),
      isRescanningIsrc,
      onArtworkUpload: handleArtworkUpload,
      onArtworkRevert: handleArtworkRevert,
      onReleaseChange: updateRow,
      onSaveMetadata: handleSaveMetadata,
      onSavePrimaryIsrc: handleSavePrimaryIsrc,
      onSaveLyrics: handleSaveLyrics,
      onSaveTargetPlaylists: handleSaveTargetPlaylists,
      onFormatLyrics: handleFormatLyrics,
      isLyricsSaving,
      isSaving,
      allowDownloads: allowArtworkDownloads,
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
    allowArtworkDownloads,
    artistName,
    closeEditor,
    editingRelease,
    handleAddUrl,
    handleArtworkRevert,
    handleArtworkUpload,
    handleCanvasStatusUpdate,
    handleFormatLyrics,
    handleRefreshRelease,
    handleRescanIsrc,
    handleSaveLyrics,
    handleSaveMetadata,
    handleSavePrimaryIsrc,
    handleSaveTargetPlaylists,
    isLyricsSaving,
    isRescanningIsrc,
    isSaving,
    providerConfig,
    refreshingReleaseId,
    updateRow,
  ]);

  useRegisterRightPanel(sidebarPanel);

  const selectedReleaseId = editingRelease?.id ?? null;
  const releaseCountSuffix =
    visibleReleases.length === rows.length ? '' : ` of ${rows.length}`;

  const handleClearFilters = useCallback(() => {
    setPills([]);
  }, []);

  return (
    <section
      aria-label='Releases'
      className='flex h-full flex-col focus:outline-none'
      data-design-v1-releases='true'
      data-testid='shell-releases-view'
    >
      <header className='shrink-0 px-4 pt-3 pb-2 border-b border-(--linear-app-shell-border)/60'>
        <div className='flex items-center gap-2'>
          <h1 className='text-[14px] font-caption tracking-[-0.01em] text-primary-token'>
            Releases
          </h1>
          <span className='text-[11px] tabular-nums text-quaternary-token'>
            {visibleReleases.length}
            {releaseCountSuffix}
          </span>
        </div>
        <div className='mt-2'>
          <PillSearch
            active={searchOpen}
            pills={pills}
            onPillsChange={setPills}
            artistOptions={artistOptions}
            titleOptions={titleOptions}
            albumOptions={albumOptions}
            onClose={() => {
              setSearchOpen(false);
              setPills([]);
            }}
          />
        </div>
      </header>

      <div className='flex-1 min-h-0 overflow-y-auto'>
        {visibleReleases.length === 0 ? (
          <div className='py-12 grid place-items-center text-center'>
            <div>
              <div className='text-[13px] font-caption text-secondary-token'>
                {rows.length === 0
                  ? 'No releases yet'
                  : 'No releases match your filters'}
              </div>
              {pills.length > 0 ? (
                <button
                  type='button'
                  onClick={handleClearFilters}
                  className='mt-2 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors duration-150 ease-out'
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
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

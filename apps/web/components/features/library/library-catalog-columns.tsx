'use client';

// @coverage-via apps/web/tests/unit/library/LibraryCatalogWaveformCell.test.tsx

import { StatusGlyph, type StatusGlyphState } from '@jovie/ui';
import { memo, useMemo } from 'react';
import { LibraryMediaThumbnail } from '@/app/app/(shell)/library/LibraryMediaThumbnail';
import {
  formatLibraryDuration,
  hasVerifiedLibraryAudioPreview,
  type LibraryReleaseAsset,
} from '@/app/app/(shell)/library/library-data';
import { libraryWaveformPeaks } from '@/app/app/(shell)/library/library-waveform-peaks';
import { alignment } from '@/components/organisms/table/table.styles';
import {
  type DspAvatarItem,
  DspAvatarStack,
} from '@/components/shell/DspAvatarStack';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import { type ColumnDef, createColumnHelper } from '@/lib/tanstack-table';
import { capitalizeFirst } from '@/lib/utils/string-utils';

// ---------------------------------------------------------------------------
// Dense Tracks-catalog columns for the Library Table view mode (JOV-4846).
// Recreated from the /exp/shell-v1 Tracks table in the shared layer — the
// experiment code is never imported. Every cell renders production data only;
// metrics the production schema does not carry yet (BPM, key, energy, rating)
// render a stable em-dash placeholder instead of fabricated values.
// ---------------------------------------------------------------------------

export function formatReleaseType(
  type: LibraryReleaseAsset['releaseType']
): string {
  return type.split('_').map(capitalizeFirst).join(' ');
}

export function formatLibraryItemType(asset: LibraryReleaseAsset): string {
  if (asset.itemKind === 'merch') {
    const productType = asset.productType?.trim();
    return productType ? capitalizeFirst(productType) : 'Merch';
  }
  if (asset.itemKind === 'document') {
    return asset.itemStatusLabel ?? 'Document';
  }
  if (asset.catalogType === 'social') return 'Social';
  if (asset.itemKind === 'video') return 'Video';
  return formatReleaseType(asset.releaseType);
}

export function formatReleaseStatus(
  status: LibraryReleaseAsset['status']
): string {
  return capitalizeFirst(status);
}

export function formatLibraryStatus(asset: LibraryReleaseAsset): string {
  return asset.itemStatusLabel ?? formatReleaseStatus(asset.status);
}

export interface LibraryStatusGlyphSpec {
  readonly state: StatusGlyphState;
  /** One phrase for both axes; the tooltip and accessible name. */
  readonly label: string;
}

/**
 * Folds release status and approval into one Linear-style glyph so a tile
 * never shows two stacked "Draft" words (#10384 / JOV-3333). Progress reads
 * left to right: empty ring (draft), half (scheduled), check (out). Review is
 * the one approval state that needs attention, so it owns the glyph; any
 * other approval state only qualifies the label.
 */
export function resolveLibraryStatusGlyph(
  asset: LibraryReleaseAsset
): LibraryStatusGlyphSpec {
  if (
    asset.lifecycleStatus === 'archived' ||
    asset.approvalStatus === 'archived'
  ) {
    return { state: 'canceled', label: 'Archived' };
  }
  const status = formatLibraryStatus(asset);
  if (asset.approvalStatus === 'needs_review') {
    return { state: 'in_review', label: `${status} · Needs review` };
  }
  const state: StatusGlyphState =
    asset.status === 'released'
      ? 'done'
      : asset.status === 'scheduled'
        ? 'in_progress'
        : 'todo';
  if (asset.approvalStatus === 'approved') {
    return { state, label: `${status} · Approved` };
  }
  // An unapproved draft has nothing to approve yet; say it once.
  return {
    state,
    label: asset.status === 'draft' ? status : `${status} · Not approved`,
  };
}

/** The one status mark for tile, row, table and inspector. */
export const LibraryStatusGlyph = memo(function LibraryStatusGlyph({
  asset,
  showLabel = false,
  className,
}: {
  readonly asset: LibraryReleaseAsset;
  /** Visible words, for the inspector only; elsewhere the glyph speaks. */
  readonly showLabel?: boolean;
  readonly className?: string;
}) {
  const { state, label } = resolveLibraryStatusGlyph(asset);
  return (
    <StatusGlyph
      state={state}
      size='md'
      tooltipLabel={label}
      label={showLabel ? label : undefined}
      data-testid={`library-status-glyph-${asset.id}`}
      className={className}
    />
  );
});

export const LibraryCatalogStatusCell = memo(function LibraryCatalogStatusCell({
  asset,
}: {
  readonly asset: LibraryReleaseAsset;
}) {
  return (
    <span className='flex h-6 items-center'>
      <LibraryStatusGlyph asset={asset} />
    </span>
  );
});

export const LibraryCatalogArtworkCell = memo(
  function LibraryCatalogArtworkCell({
    asset,
  }: {
    readonly asset: LibraryReleaseAsset;
  }) {
    return (
      <LibraryMediaThumbnail
        asset={asset}
        size='row'
        className='system-b-library-artwork-shell block h-6 w-6'
      />
    );
  }
);

/**
 * Neutral fallback avatar color for provider keys missing from
 * `PROVIDER_CONFIG`. Points at a System B text token — no raw hex here.
 */
const LIBRARY_DSP_FALLBACK_COLOR = 'var(--linear-text-quaternary)';

/**
 * Map a library asset's provider links -> `DspAvatarItem[]` for the stacked
 * provider-logo affordance. Every link present on the asset renders `live`;
 * brand color + label come from the canonical `PROVIDER_CONFIG`.
 */
export function libraryProvidersToDspItems(
  providers: LibraryReleaseAsset['providers']
): DspAvatarItem[] {
  return providers.map(provider => {
    const config = PROVIDER_CONFIG[provider.key];
    const label = config?.label ?? provider.label;
    return {
      id: provider.key,
      label,
      glyph: label.charAt(0).toUpperCase(),
      color: config?.accent ?? LIBRARY_DSP_FALLBACK_COLOR,
      status: 'live' as const,
    };
  });
}

export const LibraryCatalogProvidersCell = memo(
  function LibraryCatalogProvidersCell({
    asset,
  }: {
    readonly asset: LibraryReleaseAsset;
  }) {
    const items = libraryProvidersToDspItems(asset.providers);

    if (items.length === 0) {
      return (
        <span
          role='img'
          aria-label='No Providers'
          className='system-b-library-meta-text text-quaternary-token'
        >
          &mdash;
        </span>
      );
    }

    return <DspAvatarStack dsps={items} maxVisible={3} />;
  }
);

/**
 * Placeholder for catalog metrics the production schema does not carry yet
 * (BPM, musical key, energy, rating). Fixed-size em-dash so the dense row
 * never shifts when real values land. Hidden metric columns leave no compact
 * form behind: a run of dashes beside the title says nothing.
 */
export type LibraryCatalogMetric = 'bpm' | 'key' | 'energy' | 'rating';

const LIBRARY_CATALOG_METRIC_LABELS: Record<LibraryCatalogMetric, string> = {
  bpm: 'BPM',
  key: 'Key',
  energy: 'Energy',
  rating: 'Rating',
};

export const LibraryCatalogMetricCell = memo(function LibraryCatalogMetricCell({
  asset,
  metric,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly metric: LibraryCatalogMetric;
}) {
  const label = LIBRARY_CATALOG_METRIC_LABELS[metric];
  return (
    <span
      role='img'
      aria-label={`${label}: Not Available`}
      title={`${label} is not available for this item yet`}
      data-testid={`library-catalog-${metric}-${asset.id}`}
      className='system-b-library-meta-text block text-right text-quaternary-token'
    >
      &mdash;
    </span>
  );
});

export const LibraryCatalogLengthCell = memo(function LibraryCatalogLengthCell({
  asset,
}: {
  readonly asset: LibraryReleaseAsset;
}) {
  return (
    <span
      data-testid={`library-catalog-length-${asset.id}`}
      className='system-b-library-meta-text block whitespace-nowrap text-right tabular-nums text-tertiary-token'
    >
      {asset.totalDurationMs ? (
        formatLibraryDuration(asset.totalDurationMs)
      ) : (
        <span role='img' aria-label='Length: Not Available'>
          &mdash;
        </span>
      )}
    </span>
  );
});

const CATALOG_WAVEFORM_BAR_COUNT = 48;
const CATALOG_WAVEFORM_WIDTH = 160;
const CATALOG_WAVEFORM_HEIGHT = 24;

/**
 * Static mini waveform for the dense catalog row. Fixed canvas (160x24) so
 * empty/loading/populated states and view-mode switches never shift layout.
 * Peaks derive deterministically from the asset's waveform seed — the same
 * production source as the card scrub waveform. Decorative: row click already
 * opens the asset, so no seek interaction here. If media QA has not verified a
 * playable preview, keep the reserved cell and show an honest unavailable
 * marker instead of a synthetic waveform.
 */
export const LibraryCatalogWaveformCell = memo(
  function LibraryCatalogWaveformCell({
    asset,
  }: {
    readonly asset: LibraryReleaseAsset;
  }) {
    const hasVerifiedPreview = hasVerifiedLibraryAudioPreview(asset);
    const peaks = useMemo(() => {
      const all = libraryWaveformPeaks(asset.waveformSeed);
      const stride = all.length / CATALOG_WAVEFORM_BAR_COUNT;
      return Array.from(
        { length: CATALOG_WAVEFORM_BAR_COUNT },
        (_, index) => all[Math.floor(index * stride)] ?? 0.08
      );
    }, [asset.waveformSeed]);

    const barStride = CATALOG_WAVEFORM_WIDTH / CATALOG_WAVEFORM_BAR_COUNT;
    const maxAmp = CATALOG_WAVEFORM_HEIGHT / 2 - 1;

    return (
      <div
        data-testid={`library-catalog-waveform-${asset.id}`}
        data-audio-state={hasVerifiedPreview ? 'verified' : 'unavailable'}
        {...(hasVerifiedPreview
          ? { 'aria-hidden': true }
          : {
              role: 'img',
              'aria-label': 'Audio preview unavailable',
              title: 'Audio preview unavailable',
            })}
        className='flex h-6 w-40 items-center text-quaternary-token'
      >
        {hasVerifiedPreview ? (
          <svg
            viewBox={`0 0 ${CATALOG_WAVEFORM_WIDTH} ${CATALOG_WAVEFORM_HEIGHT}`}
            preserveAspectRatio='none'
            aria-hidden='true'
            className='block h-6 w-40'
          >
            {peaks.map((height, index) => {
              const x = index * barStride + barStride / 2;
              const half = Math.max(0.5, height * maxAmp);
              return (
                <line
                  key={x}
                  x1={x}
                  x2={x}
                  y1={CATALOG_WAVEFORM_HEIGHT / 2 - half}
                  y2={CATALOG_WAVEFORM_HEIGHT / 2 + half}
                  stroke='currentColor'
                  strokeWidth={Math.max(1, barStride * 0.4)}
                  strokeLinecap='round'
                />
              );
            })}
          </svg>
        ) : (
          <span aria-hidden='true' className='text-tertiary-token'>
            &mdash;
          </span>
        )}
      </div>
    );
  }
);

const libraryCatalogColumnHelper = createColumnHelper<LibraryReleaseAsset>();

/**
 * Dense Tracks-catalog column set for the Library Table view mode:
 * status · artwork · title · artist · type · BPM · key · energy · rating ·
 * length · waveform · DSP providers. The row-level action menu column is
 * appended by the caller (it needs the surface's entity-action context).
 */
export const LIBRARY_CATALOG_TABLE_COLUMNS = [
  libraryCatalogColumnHelper.display({
    id: 'status',
    header: 'Status',
    cell: ({ row }) => <LibraryCatalogStatusCell asset={row.original} />,
    size: 44,
    minSize: 44,
    enableSorting: false,
    meta: {
      className: alignment.workspaceSeamX,
      minWidth: 44,
      headerVisibility: 'sr-only',
    },
  }),
  libraryCatalogColumnHelper.display({
    id: 'artwork',
    header: 'Artwork',
    cell: ({ row }) => <LibraryCatalogArtworkCell asset={row.original} />,
    size: 40,
    minSize: 40,
    enableSorting: false,
    // 24px art plus the canonical cell padding; the title names the item.
    meta: { className: 'px-2', minWidth: 40, headerVisibility: 'sr-only' },
  }),
  libraryCatalogColumnHelper.accessor('title', {
    id: 'title',
    header: 'Title',
    cell: ({ row }) => (
      // Fluid cell: no min-content width, so the auto-layout table shrinks
      // this column and long titles truncate instead of pushing trailing
      // columns out of the container.
      <span
        title={row.original.title}
        className='system-b-library-release-title system-b-library-fluid-cell block truncate'
      >
        {row.original.title}
      </span>
    ),
    minSize: 180,
    size: 9999,
    enableSorting: false,
    meta: { className: 'px-2', primary: true, minWidth: 180 },
  }),
  libraryCatalogColumnHelper.accessor('artist', {
    id: 'artist',
    header: 'Artist',
    cell: ({ row }) => (
      <span
        title={row.original.artist}
        className='system-b-library-meta-text system-b-library-fluid-cell block truncate text-tertiary-token'
      >
        {row.original.artist}
      </span>
    ),
    size: 160,
    minSize: 120,
    enableSorting: false,
    meta: {
      className: 'px-2',
      priority: 5,
      minWidth: 160,
    },
  }),
  libraryCatalogColumnHelper.display({
    id: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <span
        title={formatLibraryItemType(row.original)}
        className='system-b-library-meta-text system-b-library-fluid-cell block truncate text-tertiary-token'
      >
        {formatLibraryItemType(row.original)}
      </span>
    ),
    size: 120,
    minSize: 96,
    meta: {
      className: 'pl-2 pr-3',
      priority: 6,
      minWidth: 120,
    },
  }),
  libraryCatalogColumnHelper.display({
    id: 'bpm',
    header: 'BPM',
    cell: ({ row }) => (
      <LibraryCatalogMetricCell asset={row.original} metric='bpm' />
    ),
    size: 72,
    minSize: 64,
    meta: {
      className: 'px-2',
      priority: 4,
      minWidth: 72,
    },
  }),
  libraryCatalogColumnHelper.display({
    id: 'key',
    header: 'Key',
    cell: ({ row }) => (
      <LibraryCatalogMetricCell asset={row.original} metric='key' />
    ),
    size: 72,
    minSize: 64,
    meta: {
      className: 'px-2',
      priority: 4,
      minWidth: 72,
    },
  }),
  libraryCatalogColumnHelper.display({
    id: 'energy',
    header: 'Energy',
    cell: ({ row }) => (
      <LibraryCatalogMetricCell asset={row.original} metric='energy' />
    ),
    size: 80,
    minSize: 72,
    meta: {
      className: 'px-2',
      priority: 3,
      minWidth: 80,
    },
  }),
  libraryCatalogColumnHelper.display({
    id: 'rating',
    header: 'Rating',
    cell: ({ row }) => (
      <LibraryCatalogMetricCell asset={row.original} metric='rating' />
    ),
    size: 88,
    minSize: 80,
    meta: {
      className: 'px-2',
      priority: 3,
      minWidth: 88,
    },
  }),
  libraryCatalogColumnHelper.display({
    id: 'length',
    header: 'Length',
    cell: ({ row }) => <LibraryCatalogLengthCell asset={row.original} />,
    size: 80,
    minSize: 72,
    meta: {
      className: 'px-2',
      priority: 5,
      minWidth: 80,
    },
  }),
  libraryCatalogColumnHelper.display({
    id: 'waveform',
    header: 'Waveform',
    cell: ({ row }) => <LibraryCatalogWaveformCell asset={row.original} />,
    size: 176,
    minSize: 176,
    enableSorting: false,
    meta: { className: 'px-2', priority: 1, minWidth: 176 },
  }),
  libraryCatalogColumnHelper.display({
    id: 'providers',
    header: 'DSP Providers',
    cell: ({ row }) => <LibraryCatalogProvidersCell asset={row.original} />,
    size: 120,
    minSize: 96,
    meta: {
      className: 'px-2',
      priority: 5,
      minWidth: 120,
    },
  }),
] as ColumnDef<LibraryReleaseAsset, unknown>[];

/** Keep the default scan useful; technical fields stay an explicit choice. */
export const LIBRARY_CATALOG_DEFAULT_COLUMNS =
  LIBRARY_CATALOG_TABLE_COLUMNS.filter(
    column =>
      !['bpm', 'key', 'energy', 'rating', 'waveform', 'providers'].includes(
        column.id ?? ''
      )
  );

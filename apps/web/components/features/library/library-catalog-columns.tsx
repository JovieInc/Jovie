'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { memo, useMemo } from 'react';
import { LibraryMediaThumbnail } from '@/app/app/(shell)/library/LibraryMediaThumbnail';
import {
  formatLibraryDuration,
  hasVerifiedLibraryAudioPreview,
  type LibraryReleaseAsset,
} from '@/app/app/(shell)/library/library-data';
import { libraryWaveformPeaks } from '@/app/app/(shell)/library/library-waveform-peaks';
import { ArtworkFrame } from '@/components/atoms/ArtworkFrame';
import { alignment } from '@/components/organisms/table/table.styles';
import {
  type DspAvatarItem,
  DspAvatarStack,
} from '@/components/shell/DspAvatarStack';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import { releaseStatusClasses } from '@/lib/library/release-status';
import { cn } from '@/lib/utils';
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
    return asset.productType?.trim() || 'Merch';
  }
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

export const LibraryCatalogStatusCell = memo(function LibraryCatalogStatusCell({
  asset,
}: {
  readonly asset: LibraryReleaseAsset;
}) {
  return (
    <span
      role='status'
      className={cn(
        'system-b-library-status-pill inline-flex h-6 w-fit max-w-full items-center truncate rounded-full border px-2 leading-4',
        releaseStatusClasses(asset.status)
      )}
      data-testid={`library-release-status-${asset.id}`}
      aria-label={`Release Status: ${formatLibraryStatus(asset)}`}
    >
      {formatLibraryStatus(asset)}
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
      <ArtworkFrame
        size='thumbnail'
        className='system-b-library-artwork-shell block h-9 w-9'
      >
        <LibraryMediaThumbnail asset={asset} size='row' />
      </ArtworkFrame>
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
 * never shifts when real values land.
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
    size: 112,
    minSize: 96,
    meta: { className: alignment.workspaceSeamX },
  }),
  libraryCatalogColumnHelper.display({
    id: 'artwork',
    header: 'Artwork',
    cell: ({ row }) => <LibraryCatalogArtworkCell asset={row.original} />,
    size: 56,
    minSize: 56,
    enableSorting: false,
    meta: { className: 'px-2' },
  }),
  libraryCatalogColumnHelper.accessor('title', {
    id: 'title',
    header: 'Title',
    cell: ({ row }) => (
      <span className='system-b-library-release-title block truncate'>
        {row.original.title}
      </span>
    ),
    minSize: 180,
    size: 9999,
    enableSorting: false,
    meta: { className: 'px-2' },
  }),
  libraryCatalogColumnHelper.accessor('artist', {
    id: 'artist',
    header: 'Artist',
    cell: ({ row }) => (
      <span className='system-b-library-meta-text block truncate text-tertiary-token'>
        {row.original.artist}
      </span>
    ),
    size: 160,
    minSize: 120,
    enableSorting: false,
    meta: { className: 'hidden md:table-cell px-2' },
  }),
  libraryCatalogColumnHelper.display({
    id: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <span className='system-b-library-meta-text truncate text-tertiary-token'>
        {formatLibraryItemType(row.original)}
      </span>
    ),
    size: 120,
    minSize: 96,
    meta: { className: 'hidden sm:table-cell pl-2 pr-3' },
  }),
  libraryCatalogColumnHelper.display({
    id: 'bpm',
    header: 'BPM',
    cell: ({ row }) => (
      <LibraryCatalogMetricCell asset={row.original} metric='bpm' />
    ),
    size: 72,
    minSize: 64,
    meta: { className: 'hidden lg:table-cell px-2' },
  }),
  libraryCatalogColumnHelper.display({
    id: 'key',
    header: 'Key',
    cell: ({ row }) => (
      <LibraryCatalogMetricCell asset={row.original} metric='key' />
    ),
    size: 72,
    minSize: 64,
    meta: { className: 'hidden lg:table-cell px-2' },
  }),
  libraryCatalogColumnHelper.display({
    id: 'energy',
    header: 'Energy',
    cell: ({ row }) => (
      <LibraryCatalogMetricCell asset={row.original} metric='energy' />
    ),
    size: 80,
    minSize: 72,
    meta: { className: 'hidden xl:table-cell px-2' },
  }),
  libraryCatalogColumnHelper.display({
    id: 'rating',
    header: 'Rating',
    cell: ({ row }) => (
      <LibraryCatalogMetricCell asset={row.original} metric='rating' />
    ),
    size: 88,
    minSize: 80,
    meta: { className: 'hidden xl:table-cell px-2' },
  }),
  libraryCatalogColumnHelper.display({
    id: 'length',
    header: 'Length',
    cell: ({ row }) => <LibraryCatalogLengthCell asset={row.original} />,
    size: 80,
    minSize: 72,
    meta: { className: 'hidden md:table-cell px-2' },
  }),
  libraryCatalogColumnHelper.display({
    id: 'waveform',
    header: 'Waveform',
    cell: ({ row }) => <LibraryCatalogWaveformCell asset={row.original} />,
    size: 176,
    minSize: 176,
    enableSorting: false,
    meta: { className: 'hidden xl:table-cell px-2' },
  }),
  libraryCatalogColumnHelper.display({
    id: 'providers',
    header: 'DSP Providers',
    cell: ({ row }) => <LibraryCatalogProvidersCell asset={row.original} />,
    size: 120,
    minSize: 96,
    meta: { className: 'hidden md:table-cell px-2' },
  }),
] as ColumnDef<LibraryReleaseAsset, unknown>[];

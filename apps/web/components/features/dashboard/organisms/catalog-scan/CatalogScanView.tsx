'use client';

import { Button } from '@jovie/ui';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type {
  CatalogScanPageData,
  DspCatalogMismatch,
} from '@/app/app/(shell)/dashboard/catalog-scan/actions';
import { APP_ROUTES } from '@/constants/routes';

type FilterTab = 'needs_review' | 'not_mine' | 'dismissed' | 'all';

export function CatalogScanView({
  data,
}: {
  readonly data: CatalogScanPageData;
}) {
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(!!data.pendingScan);
  const [_scanId, setScanId] = useState<string | null>(
    data.pendingScan?.id ?? null
  );
  const [activeFilter, setActiveFilter] = useState<FilterTab>('needs_review');
  const [selectedMismatch, setSelectedMismatch] =
    useState<DspCatalogMismatch | null>(null);

  const { profileId, spotifyId, latestScan, mismatches } = data;

  // Poll for scan completion
  const pollScanStatus = useCallback(
    async (id: string) => {
      const poll = async () => {
        try {
          const res = await fetch(`/api/dsp/catalog-scan/status?scanId=${id}`);
          const json = await res.json();
          if (
            json.scan?.status === 'completed' ||
            json.scan?.status === 'failed'
          ) {
            setIsScanning(false);
            setScanId(null);
            router.refresh();
            return;
          }
          setTimeout(poll, 2000);
        } catch {
          setTimeout(poll, 3000);
        }
      };
      poll();
    },
    [router]
  );

  const triggerScan = useCallback(async () => {
    if (!spotifyId || isScanning) return;
    setIsScanning(true);

    try {
      const res = await fetch('/api/dsp/catalog-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, spotifyArtistId: spotifyId }),
      });
      const json = await res.json();
      if (json.scanId) {
        setScanId(json.scanId);
        pollScanStatus(json.scanId);
      } else {
        setIsScanning(false);
      }
    } catch {
      setIsScanning(false);
    }
  }, [spotifyId, profileId, isScanning, pollScanStatus]);

  // Start polling if we loaded with a pending scan
  useState(() => {
    if (data.pendingScan?.id) {
      pollScanStatus(data.pendingScan.id);
    }
  });

  const updateMismatchStatus = useCallback(
    async (
      mismatchId: string,
      status: 'confirmed_mismatch' | 'dismissed' | 'flagged'
    ) => {
      try {
        const res = await fetch(
          `/api/dsp/catalog-scan/mismatches/${mismatchId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          }
        );
        if (res.ok) {
          router.refresh();
        }
      } catch {
        // Error handling
      }
    },
    [router]
  );

  // Filter mismatches
  const filteredMismatches = mismatches.filter(m => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'needs_review') return m.status === 'flagged';
    if (activeFilter === 'not_mine') return m.status === 'confirmed_mismatch';
    if (activeFilter === 'dismissed') return m.status === 'dismissed';
    return true;
  });

  const counts = {
    needs_review: mismatches.filter(m => m.status === 'flagged').length,
    not_mine: mismatches.filter(m => m.status === 'confirmed_mismatch').length,
    dismissed: mismatches.filter(m => m.status === 'dismissed').length,
    all: mismatches.length,
  };

  // No Spotify match gate
  if (!spotifyId) {
    return (
      <div className='p-6'>
        <div className='flex flex-col items-center justify-center py-20 text-center'>
          <Search className='h-12 w-12 text-muted-foreground/30 mb-4' />
          <h3 className='text-lg font-medium mb-2'>
            Connect your Spotify profile first
          </h3>
          <p className='text-sm text-muted-foreground mb-6 max-w-md'>
            To scan your catalog for mismatches, we need to know which Spotify
            profile is yours.
          </p>
          <Button
            onClick={() => router.push(APP_ROUTES.PRESENCE)}
            variant='primary'
          >
            Go to Presence
          </Button>
        </div>
      </div>
    );
  }

  // Scanning state
  if (isScanning) {
    return (
      <div className='p-6'>
        <div className='flex flex-col items-center justify-center py-20 text-center'>
          <Loader2 className='h-10 w-10 animate-spin text-primary mb-4' />
          <h3 className='text-lg font-medium mb-2'>
            Scanning your Spotify catalog...
          </h3>
          <p className='text-sm text-muted-foreground'>
            Fetching albums, checking tracks, cross-referencing ISRCs. This
            usually takes 10-30 seconds.
          </p>
        </div>
      </div>
    );
  }

  // Never scanned state
  if (!latestScan) {
    return (
      <div className='p-6'>
        <div className='flex flex-col items-center justify-center py-20 text-center'>
          <Search className='h-12 w-12 text-muted-foreground/30 mb-4' />
          <h3 className='text-lg font-medium mb-2'>
            Scan your Spotify catalog
          </h3>
          <p className='text-sm text-muted-foreground mb-6 max-w-md'>
            We&apos;ll check every release on your Spotify profile against your
            catalog. If any releases don&apos;t belong to you, we&apos;ll flag
            them.
          </p>
          <Button onClick={triggerScan}>Run First Scan</Button>
        </div>
      </div>
    );
  }

  // Scan failed state
  if (latestScan.status === 'failed') {
    return (
      <div className='p-6'>
        <div className='flex flex-col items-center justify-center py-20 text-center'>
          <XCircle className='h-12 w-12 text-destructive/50 mb-4' />
          <h3 className='text-lg font-medium mb-2'>Scan failed</h3>
          <p className='text-sm text-muted-foreground mb-2'>
            {latestScan.error ?? 'An unexpected error occurred.'}
          </p>
          <p className='text-sm text-muted-foreground mb-6'>
            This usually resolves on retry.
          </p>
          <Button onClick={triggerScan}>Retry Scan</Button>
        </div>
      </div>
    );
  }

  // Clean result (0 mismatches)
  if (mismatches.length === 0) {
    return (
      <div className='p-6'>
        <div className='flex items-center justify-between mb-6'>
          <h2 className='text-lg font-semibold'>Catalog Scan</h2>
          <Button
            variant='outline'
            size='sm'
            onClick={triggerScan}
            disabled={isScanning}
          >
            <RefreshCw className='h-4 w-4 mr-2' />
            Re-scan
          </Button>
        </div>
        <div className='flex flex-col items-center justify-center py-20 text-center'>
          <CheckCircle2 className='h-12 w-12 text-green-500/70 mb-4' />
          <h3 className='text-lg font-medium mb-2'>All clear!</h3>
          <p className='text-sm text-muted-foreground mb-2'>
            {latestScan.matchedCount} of {latestScan.catalogIsrcCount} ISRCs
            matched ({latestScan.coveragePct}% coverage).
          </p>
          <p className='text-sm text-muted-foreground'>
            No suspicious releases found on your Spotify profile.
          </p>
          {latestScan.completedAt && (
            <p className='text-xs text-muted-foreground/60 mt-4'>
              Last scanned{' '}
              {new Date(latestScan.completedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Results with mismatches
  return (
    <div className='p-6'>
      <div className='flex items-center justify-between mb-6'>
        <h2 className='text-lg font-semibold'>Catalog Scan</h2>
        <Button
          variant='outline'
          size='sm'
          onClick={triggerScan}
          disabled={isScanning}
        >
          <RefreshCw className='h-4 w-4 mr-2' />
          Re-scan
        </Button>
      </div>
      {/* Summary stats */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6'>
        <SummaryCard
          label='Coverage'
          value={`${latestScan.coveragePct}%`}
          sub={`${latestScan.matchedCount} of ${latestScan.catalogIsrcCount} ISRCs`}
          variant='default'
        />
        <SummaryCard
          label='Needs Review'
          value={String(counts.needs_review)}
          sub='ISRCs not in your catalog'
          variant={counts.needs_review > 0 ? 'warning' : 'default'}
        />
        <SummaryCard
          label='Confirmed Not Mine'
          value={String(counts.not_mine)}
          sub='Needs correction on Spotify'
          variant={counts.not_mine > 0 ? 'destructive' : 'default'}
        />
        <SummaryCard
          label='Albums Scanned'
          value={String(latestScan.albumsScanned)}
          sub={`${latestScan.tracksScanned} tracks checked`}
          variant='default'
        />
      </div>

      {latestScan.albumsScanned >= 500 && (
        <div className='flex items-center gap-2 px-3 py-2 mb-4 rounded-md bg-amber-500/10 text-amber-600 text-xs'>
          <AlertTriangle className='h-3.5 w-3.5 flex-shrink-0' />
          Showing results for first 500 albums. Full catalog scan coming soon.
        </div>
      )}

      {/* Filter tabs */}
      <div className='flex gap-1 mb-4 border-b border-border'>
        {(
          [
            { key: 'needs_review', label: 'Needs Review' },
            { key: 'not_mine', label: 'Not Mine' },
            { key: 'dismissed', label: 'Dismissed' },
            { key: 'all', label: 'All' },
          ] as const
        ).map(({ key, label }) => (
          <button
            type='button'
            key={key}
            onClick={() => setActiveFilter(key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeFilter === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            {counts[key] > 0 && (
              <span className='ml-1.5 text-muted-foreground'>
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Mismatch list + sidebar */}
      <div className='flex gap-4'>
        {/* List */}
        <div className='flex-1 min-w-0 space-y-1'>
          {filteredMismatches.length === 0 ? (
            <div className='py-12 text-center text-sm text-muted-foreground'>
              No items match this filter.
            </div>
          ) : (
            filteredMismatches.map(m => (
              <MismatchRow
                key={m.id}
                mismatch={m}
                isSelected={selectedMismatch?.id === m.id}
                onClick={() =>
                  setSelectedMismatch(selectedMismatch?.id === m.id ? null : m)
                }
              />
            ))
          )}
        </div>

        {/* Sidebar */}
        {selectedMismatch && (
          <div className='hidden lg:block w-[340px] flex-shrink-0'>
            <MismatchSidebar
              mismatch={selectedMismatch}
              onUpdateStatus={updateMismatchStatus}
              onClose={() => setSelectedMismatch(null)}
            />
          </div>
        )}
      </div>

      {latestScan.completedAt && (
        <p className='text-xs text-muted-foreground/60 mt-6'>
          Last scanned {new Date(latestScan.completedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function SummaryCard({
  label,
  value,
  sub,
  variant,
}: {
  label: string;
  value: string;
  sub: string;
  variant: 'default' | 'warning' | 'destructive';
}) {
  const valueColor =
    variant === 'warning'
      ? 'text-amber-500'
      : variant === 'destructive'
        ? 'text-red-500'
        : 'text-foreground';

  return (
    <div className='rounded-lg border border-border bg-card p-3'>
      <p className='text-[10px] uppercase tracking-wider text-muted-foreground mb-1'>
        {label}
      </p>
      <p className={`text-xl font-semibold ${valueColor}`}>{value}</p>
      <p className='text-[11px] text-muted-foreground mt-0.5'>{sub}</p>
    </div>
  );
}

function MismatchRow({
  mismatch,
  isSelected,
  onClick,
}: {
  mismatch: DspCatalogMismatch;
  isSelected: boolean;
  onClick: () => void;
}) {
  const statusBadge = {
    flagged: {
      label: 'Needs Review',
      className: 'bg-amber-500/10 text-amber-600',
    },
    confirmed_mismatch: {
      label: 'Not Mine',
      className: 'bg-red-500/10 text-red-500',
    },
    dismissed: {
      label: 'Dismissed',
      className: 'bg-muted text-muted-foreground',
    },
  }[mismatch.status];

  const typeBadge =
    mismatch.mismatchType === 'not_in_catalog'
      ? { label: 'Not in catalog', className: 'bg-amber-500/10 text-amber-600' }
      : {
          label: 'Missing from Spotify',
          className: 'bg-blue-500/10 text-blue-500',
        };

  return (
    <button
      type='button'
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors ${
        isSelected
          ? 'bg-accent border-l-2 border-primary'
          : 'hover:bg-accent/50'
      } ${mismatch.status === 'dismissed' ? 'opacity-50' : ''}`}
    >
      {/* Album art placeholder — external CDN URLs, not optimizable via next/image */}
      {mismatch.externalArtworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mismatch.externalArtworkUrl}
          alt=''
          className='w-9 h-9 rounded object-cover flex-shrink-0'
        />
      ) : (
        <div className='w-9 h-9 rounded bg-muted flex-shrink-0' />
      )}

      {/* Track info */}
      <div className='flex-1 min-w-0'>
        <p className='text-sm font-medium truncate'>
          {mismatch.externalTrackName ?? mismatch.isrc}
        </p>
        <p className='text-xs text-muted-foreground truncate'>
          {mismatch.externalArtistNames ?? 'Unknown artist'}
          {mismatch.externalAlbumName ? ` · ${mismatch.externalAlbumName}` : ''}
        </p>
      </div>

      {/* Badges */}
      <span
        className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${typeBadge.className}`}
      >
        {typeBadge.label}
      </span>
      <span
        className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusBadge.className}`}
      >
        {statusBadge.label}
      </span>
    </button>
  );
}

function MismatchSidebar({
  mismatch,
  onUpdateStatus,
  onClose,
}: {
  mismatch: DspCatalogMismatch;
  onUpdateStatus: (
    id: string,
    status: 'confirmed_mismatch' | 'dismissed' | 'flagged'
  ) => void;
  onClose: () => void;
}) {
  return (
    <div className='sticky top-4 rounded-lg border border-border bg-card p-4'>
      {/* Album art — external CDN URLs, not optimizable via next/image */}
      {mismatch.externalArtworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mismatch.externalArtworkUrl}
          alt=''
          className='w-full aspect-square rounded-md object-cover mb-4'
        />
      ) : (
        <div className='w-full aspect-square rounded-md bg-muted mb-4 flex items-center justify-center text-muted-foreground text-sm'>
          No artwork
        </div>
      )}

      <h3 className='text-sm font-semibold mb-1'>
        {mismatch.externalTrackName ?? 'Unknown Track'}
      </h3>
      <p className='text-xs text-muted-foreground mb-4'>
        {mismatch.externalAlbumName ?? 'Unknown Album'} ·{' '}
        {mismatch.externalArtistNames ?? 'Unknown'}
      </p>

      <div className='space-y-2 mb-4'>
        <DetailRow label='ISRC' value={mismatch.isrc} mono />
        {mismatch.externalTrackId && (
          <DetailRow
            label='Spotify Track ID'
            value={mismatch.externalTrackId}
            mono
          />
        )}
        <DetailRow
          label='In your catalog?'
          value={
            mismatch.mismatchType === 'not_in_catalog'
              ? 'No'
              : 'Yes (missing from Spotify)'
          }
          highlight={mismatch.mismatchType === 'not_in_catalog'}
        />
        <DetailRow
          label='Status'
          value={
            mismatch.status === 'flagged'
              ? 'Needs Review'
              : mismatch.status === 'confirmed_mismatch'
                ? 'Not Mine'
                : 'Dismissed'
          }
        />
      </div>

      {/* Actions */}
      <div className='flex gap-2 mb-3'>
        {mismatch.status !== 'confirmed_mismatch' && (
          <Button
            variant='destructive'
            size='sm'
            className='flex-1'
            onClick={() => onUpdateStatus(mismatch.id, 'confirmed_mismatch')}
          >
            Not Mine
          </Button>
        )}
        {mismatch.status !== 'dismissed' && (
          <Button
            variant='outline'
            size='sm'
            className='flex-1'
            onClick={() => onUpdateStatus(mismatch.id, 'dismissed')}
          >
            Dismiss
          </Button>
        )}
        {(mismatch.status === 'confirmed_mismatch' ||
          mismatch.status === 'dismissed') && (
          <Button
            variant='ghost'
            size='sm'
            className='flex-1'
            onClick={() => onUpdateStatus(mismatch.id, 'flagged')}
          >
            Reset
          </Button>
        )}
      </div>

      {mismatch.status === 'confirmed_mismatch' && (
        <div className='rounded-md bg-amber-500/10 p-3 text-xs'>
          <p className='font-medium text-amber-600 mb-1'>
            To get this removed from your profile:
          </p>
          <a
            href='https://artists.spotify.com/c/content-mismatch'
            target='_blank'
            rel='noopener noreferrer'
            className='text-primary hover:underline'
          >
            Open Spotify for Artists content mismatch form ↗
          </a>
        </div>
      )}

      {mismatch.externalTrackId && (
        <a
          href={`https://open.spotify.com/track/${mismatch.externalTrackId}`}
          target='_blank'
          rel='noopener noreferrer'
          className='block text-center text-xs text-green-500 hover:underline mt-3'
        >
          Open on Spotify ↗
        </a>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className='flex justify-between items-center py-1.5 border-b border-border/50 text-xs'>
      <span className='text-muted-foreground'>{label}</span>
      <span
        className={`${mono ? 'font-mono text-[11px]' : ''} ${highlight ? 'text-amber-500' : 'text-foreground'} max-w-[180px] truncate`}
      >
        {value}
      </span>
    </div>
  );
}

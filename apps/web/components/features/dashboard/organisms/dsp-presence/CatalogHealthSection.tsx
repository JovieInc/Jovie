'use client';

import { Button } from '@jovie/ui';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RefreshCw,
  ScanSearch,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MismatchCard } from './MismatchCard';
import type { CatalogMismatch, CatalogScan } from './types';

// ============================================================================
// Types
// ============================================================================

interface CatalogHealthSectionProps {
  readonly profileId: string;
  readonly spotifyId: string | null;
  readonly hasUnresolvedMismatches: boolean;
}

interface ScanResultsData {
  scan: CatalogScan | null;
  mismatches: CatalogMismatch[];
}

const SCAN_POLL_FAST_INTERVAL_MS = 2_000;
const SCAN_POLL_BACKOFF_INTERVAL_MS = 5_000;
const SCAN_POLL_FAST_WINDOW_MS = SCAN_POLL_FAST_INTERVAL_MS * 3;
const SCAN_POLL_TIMEOUT_MS = 2 * 60 * 1000;

function getCatalogScanPollDelayMs(
  pollStartedAt: number,
  currentTime: number
): number | false {
  const elapsed = currentTime - pollStartedAt;

  if (elapsed >= SCAN_POLL_TIMEOUT_MS) {
    return false;
  }

  return elapsed < SCAN_POLL_FAST_WINDOW_MS
    ? SCAN_POLL_FAST_INTERVAL_MS
    : SCAN_POLL_BACKOFF_INTERVAL_MS;
}

// ============================================================================
// Header helpers
// ============================================================================

function getCatalogHeaderText(opts: {
  isScanning: boolean;
  scanFailed: boolean;
  neverScanned: boolean;
  allClear: boolean;
  matchedCount: number;
  unresolvedCount: number;
}): string {
  if (opts.isScanning) return 'Scanning...';
  if (opts.scanFailed) return 'Scan failed';
  if (opts.neverScanned) return 'Catalog Health';
  if (opts.allClear) return `All clear — ${opts.matchedCount} ISRCs matched`;
  return `Catalog Health — ${opts.unresolvedCount} to review`;
}

function CatalogStatusIcon({
  isScanning,
  scanFailed,
  allClear,
  hasResults,
}: Readonly<{
  isScanning: boolean;
  scanFailed: boolean;
  allClear: boolean;
  hasResults: boolean;
}>) {
  if (isScanning)
    return <Loader2 className='h-3.5 w-3.5 animate-spin text-primary' />;
  if (scanFailed) return <XCircle className='h-3.5 w-3.5 text-destructive' />;
  if (allClear) return <CheckCircle2 className='h-3.5 w-3.5 text-green-500' />;
  if (hasResults)
    return <AlertTriangle className='h-3.5 w-3.5 text-amber-500' />;
  return <ScanSearch className='h-3.5 w-3.5 text-muted-foreground' />;
}

// ============================================================================
// Main Component
// ============================================================================

export function CatalogHealthSection({
  profileId,
  spotifyId,
  hasUnresolvedMismatches,
}: CatalogHealthSectionProps) {
  const [isOpen, setIsOpen] = useState(hasUnresolvedMismatches);
  const [data, setData] = useState<ScanResultsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [localMismatches, setLocalMismatches] = useState<
    CatalogMismatch[] | null
  >(null);
  const [confirmedNotMineCount, setConfirmedNotMineCount] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);

  const mismatches = localMismatches ?? data?.mismatches ?? [];
  const unresolvedNotInCatalog = mismatches.filter(
    m => m.status === 'flagged' && m.mismatchType === 'not_in_catalog'
  );
  const missingFromDsp = mismatches.filter(
    m => m.status === 'flagged' && m.mismatchType === 'missing_from_dsp'
  );

  // Lazy load data when section opens
  useEffect(() => {
    if (!isOpen || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    setIsLoading(true);

    fetch(`/api/dsp/catalog-scan/results?profileId=${profileId}`)
      .then(res => res.json())
      .then((json: ScanResultsData) => {
        setData(json);
        setLocalMismatches(json.mismatches);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [isOpen, profileId]);

  // Cleanup poll timer
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const pollScanStatus = useCallback(
    (scanId: string) => {
      const pollStartedAt = Date.now();

      const poll = async () => {
        const nextDelayMs = getCatalogScanPollDelayMs(
          pollStartedAt,
          Date.now()
        );

        if (nextDelayMs === false) {
          setIsScanning(false);
          setScanError('Scan timed out. Please retry.');
          return;
        }

        try {
          const res = await fetch(
            `/api/dsp/catalog-scan/status?scanId=${scanId}`
          );
          const json = await res.json();
          if (
            json.scan?.status === 'completed' ||
            json.scan?.status === 'failed'
          ) {
            setIsScanning(false);
            if (json.scan?.status === 'failed') {
              setScanError(json.scan?.error ?? 'Scan failed');
            } else {
              hasLoadedRef.current = false;
              setIsOpen(true);
              const resultsRes = await fetch(
                `/api/dsp/catalog-scan/results?profileId=${profileId}`
              );
              const resultsJson: ScanResultsData = await resultsRes.json();
              setData(resultsJson);
              setLocalMismatches(resultsJson.mismatches);
            }
            return;
          }
          pollTimerRef.current = globalThis.setTimeout(poll, nextDelayMs);
        } catch {
          pollTimerRef.current = globalThis.setTimeout(
            poll,
            Math.max(nextDelayMs, SCAN_POLL_BACKOFF_INTERVAL_MS)
          );
        }
      };
      poll();
    },
    [profileId]
  );

  const triggerScan = useCallback(async () => {
    if (!spotifyId || isScanning) return;
    setIsScanning(true);
    setScanError(null);

    try {
      const res = await fetch('/api/dsp/catalog-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, spotifyArtistId: spotifyId }),
      });
      const json = await res.json();

      if (!res.ok) {
        setScanError(json.error ?? 'Scan failed');
        setIsScanning(false);
        return;
      }

      if (json.scanId) {
        pollScanStatus(json.scanId);
      } else {
        setIsScanning(false);
      }
    } catch {
      setScanError('Network error. Try again.');
      setIsScanning(false);
    }
  }, [spotifyId, profileId, isScanning, pollScanStatus]);

  const handleMismatchAction = useCallback(
    async (
      id: string,
      status: 'confirmed_mismatch' | 'dismissed'
    ): Promise<boolean> => {
      try {
        const res = await fetch(`/api/dsp/catalog-scan/mismatches/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    []
  );

  const handleCardRemoved = useCallback(
    (id: string, action: 'confirmed_mismatch' | 'dismissed') => {
      if (action === 'confirmed_mismatch') {
        setConfirmedNotMineCount(prev => prev + 1);
      }
      setLocalMismatches(prev => (prev ? prev.filter(m => m.id !== id) : prev));
    },
    []
  );

  const handleBulkDismiss = useCallback(async () => {
    const ids = unresolvedNotInCatalog.map(m => m.id);
    const results = await Promise.allSettled(
      ids.map(id =>
        fetch(`/api/dsp/catalog-scan/mismatches/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'dismissed' }),
        })
      )
    );
    const succeededIds = ids.filter(
      (_, i) =>
        results[i].status === 'fulfilled' &&
        (results[i] as PromiseFulfilledResult<Response>).value.ok
    );
    if (succeededIds.length > 0) {
      setLocalMismatches(prev =>
        prev ? prev.filter(m => !succeededIds.includes(m.id)) : prev
      );
    }
  }, [unresolvedNotInCatalog]);

  // No Spotify = hidden entirely
  if (!spotifyId) return null;

  // Determine section header content
  const scan = data?.scan;
  const neverScanned = !scan && !isScanning;
  const hasResults =
    scan?.status === 'completed' && unresolvedNotInCatalog.length > 0;
  const allClear =
    scan?.status === 'completed' && unresolvedNotInCatalog.length === 0;
  const scanFailed = scan?.status === 'failed' || !!scanError;

  const headerText = getCatalogHeaderText({
    isScanning,
    scanFailed,
    neverScanned,
    allClear,
    matchedCount: scan?.matchedCount ?? 0,
    unresolvedCount: unresolvedNotInCatalog.length,
  });

  return (
    <div className='border-t border-border'>
      {/* Collapsible header */}
      <button
        type='button'
        onClick={() => setIsOpen(!isOpen)}
        className='flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-accent/50'
        aria-expanded={isOpen}
      >
        <CatalogStatusIcon
          isScanning={isScanning}
          scanFailed={scanFailed}
          allClear={allClear}
          hasResults={hasResults}
        />

        <span className='flex-1 text-xs font-medium'>{headerText}</span>

        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Collapsible content */}
      {isOpen && (
        <div className='px-4 pb-4' aria-live='polite'>
          {/* Loading state */}
          {isLoading && (
            <div className='flex items-center justify-center py-8'>
              <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
            </div>
          )}

          {/* Never scanned CTA */}
          {!isLoading && neverScanned && !isScanning && (
            <div className='flex flex-col items-center py-6 text-center'>
              <p className='mb-3 text-xs text-muted-foreground'>
                Check if any releases on your Spotify profile aren&apos;t yours.
              </p>
              <Button size='sm' onClick={triggerScan}>
                Scan Catalog
              </Button>
            </div>
          )}

          {/* Scanning */}
          {isScanning && (
            <div className='flex flex-col items-center py-6 text-center'>
              <Loader2 className='mb-2 h-6 w-6 animate-spin text-primary' />
              <p className='text-xs text-muted-foreground'>
                Checking your Spotify catalog...
              </p>
            </div>
          )}

          {/* Scan failed */}
          {!isLoading && !isScanning && scanFailed && (
            <div className='flex flex-col items-center py-6 text-center'>
              <p className='mb-1 text-xs text-muted-foreground'>
                {scanError ?? 'An error occurred.'}
              </p>
              <Button
                variant='outline'
                size='sm'
                onClick={triggerScan}
                className='mt-2'
              >
                Retry
              </Button>
            </div>
          )}

          {/* All clear */}
          {!isLoading && !isScanning && !scanFailed && allClear && (
            <div className='flex items-center justify-between py-2'>
              <p className='text-xs text-muted-foreground'>
                {scan?.coveragePct}% coverage · {scan?.tracksScanned} tracks
                checked
                {scan?.completedAt &&
                  ` · ${new Date(scan.completedAt).toLocaleDateString()}`}
              </p>
              <Button
                variant='ghost'
                size='sm'
                onClick={triggerScan}
                className='h-7 gap-1.5 text-xs'
              >
                <RefreshCw className='h-3 w-3' />
                Re-scan
              </Button>
            </div>
          )}

          {/* Has mismatches — card triage */}
          {!isLoading && !isScanning && !scanFailed && hasResults && (
            <div>
              {/* Toolbar: re-scan + bulk dismiss */}
              <div className='mb-3 flex items-center justify-between'>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={triggerScan}
                  className='h-7 gap-1.5 text-xs'
                >
                  <RefreshCw className='h-3 w-3' />
                  Re-scan
                </Button>
                {unresolvedNotInCatalog.length >= 10 && (
                  <Button
                    variant='outline'
                    size='sm'
                    className='h-7 text-xs'
                    onClick={() => {
                      if (
                        confirm(
                          `Dismiss all ${unresolvedNotInCatalog.length} items?`
                        )
                      ) {
                        handleBulkDismiss();
                      }
                    }}
                  >
                    Dismiss all
                  </Button>
                )}
              </div>

              {/* Card stack */}
              <ul className='list-none space-y-1.5'>
                {unresolvedNotInCatalog.map(m => (
                  <MismatchCard
                    key={m.id}
                    mismatch={m}
                    onAction={handleMismatchAction}
                    onRemoved={handleCardRemoved}
                  />
                ))}
              </ul>

              {/* Missing from DSP info row */}
              {missingFromDsp.length > 0 && (
                <p className='mt-3 text-2xs text-muted-foreground'>
                  {missingFromDsp.length} track
                  {missingFromDsp.length === 1 ? '' : 's'} in your catalog{' '}
                  {missingFromDsp.length === 1 ? "isn't" : "aren't"} on Spotify
                  yet.
                </p>
              )}
            </div>
          )}

          {/* Post-triage summary — persistent Spotify link */}
          {!isLoading &&
            !isScanning &&
            !scanFailed &&
            scan?.status === 'completed' &&
            confirmedNotMineCount > 0 &&
            unresolvedNotInCatalog.length === 0 && (
              <div className='mt-3 rounded-md bg-amber-500/10 p-3'>
                <p className='text-xs font-medium text-amber-600'>
                  You flagged {confirmedNotMineCount} track
                  {confirmedNotMineCount === 1 ? '' : 's'} as not yours.
                </p>
                <a
                  href='https://artists.spotify.com/c/content-mismatch'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='mt-1 inline-block text-xs text-primary hover:underline'
                >
                  Report to Spotify for Artists →
                </a>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

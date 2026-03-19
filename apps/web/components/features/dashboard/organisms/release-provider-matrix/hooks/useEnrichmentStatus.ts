'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { getSpotifyImportStatus } from '@/app/app/(shell)/dashboard/releases/actions';
import type {
  AggregateEnrichmentStatus,
  EnrichmentStatusMap,
} from '@/lib/dsp-enrichment/enrichment-status';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

interface UseEnrichmentStatusParams {
  enabled: boolean;
  onEnrichmentComplete?: () => void;
}

interface UseEnrichmentStatusResult {
  enrichmentStatus: EnrichmentStatusMap;
  aggregateStatus: AggregateEnrichmentStatus;
  isEnriching: boolean;
  isComplete: boolean;
  isFailed: boolean;
  isPartial: boolean;
}

/**
 * Canonical hook for enrichment status.
 * All UI consumers (progress banner, empty states, rescue flow, celebration)
 * should read enrichment state from this single hook — no independent polling.
 */
export function useEnrichmentStatus({
  enabled,
  onEnrichmentComplete,
}: UseEnrichmentStatusParams): UseEnrichmentStatusResult {
  const [isDone, setIsDone] = useState(false);
  const onCompleteRef = useRef(onEnrichmentComplete);
  const pollStartRef = useRef<number>(0);

  useEffect(() => {
    onCompleteRef.current = onEnrichmentComplete;
  });

  useEffect(() => {
    if (enabled && !isDone) {
      pollStartRef.current = Date.now();
    }
  }, [enabled, isDone]);

  const isPolling = enabled && !isDone;

  const { data } = useQuery({
    queryKey: ['enrichment-status'],
    queryFn: ({ signal: _signal }) => getSpotifyImportStatus(),
    enabled: isPolling,
    refetchInterval: isPolling ? POLL_INTERVAL_MS : false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const enrichmentStatus = data?.enrichmentStatus ?? {};
  const aggregateStatus = data?.aggregateEnrichmentStatus ?? 'idle';

  useEffect(() => {
    if (!data || !isPolling) return;

    const timedOut =
      pollStartRef.current > 0 &&
      Date.now() - pollStartRef.current > POLL_TIMEOUT_MS;

    const finished =
      aggregateStatus === 'complete' ||
      aggregateStatus === 'failed' ||
      aggregateStatus === 'partial' ||
      timedOut;

    if (finished) {
      setIsDone(true);
      onCompleteRef.current?.();
    }
  }, [data, isPolling, aggregateStatus]);

  return {
    enrichmentStatus,
    aggregateStatus,
    isEnriching: aggregateStatus === 'enriching',
    isComplete: aggregateStatus === 'complete',
    isFailed: aggregateStatus === 'failed',
    isPartial: aggregateStatus === 'partial',
  };
}

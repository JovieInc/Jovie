'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { getSpotifyImportPollSnapshot } from '@/app/app/(shell)/dashboard/releases/actions';
import type {
  AggregateEnrichmentStatus,
  EnrichmentStatusMap,
} from '@/lib/dsp-enrichment/enrichment-status';

const POLL_INTERVAL_MS = 2000;
const BACKOFF_POLL_INTERVAL_MS = 5000;
const IDLE_POLLS_BEFORE_BACKOFF = 3;
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
  const [pollIntervalMs, setPollIntervalMs] = useState(POLL_INTERVAL_MS);
  const onCompleteRef = useRef(onEnrichmentComplete);
  const pollStartRef = useRef<number>(0);
  const stagnantPollCountRef = useRef(0);
  const lastStatusRef = useRef<AggregateEnrichmentStatus | null>(null);
  const lastProcessedPollAtRef = useRef(0);

  useEffect(() => {
    onCompleteRef.current = onEnrichmentComplete;
  });

  useEffect(() => {
    if (enabled && !isDone) {
      pollStartRef.current = Date.now();
    }
  }, [enabled, isDone]);

  useEffect(() => {
    if (enabled) {
      setPollIntervalMs(POLL_INTERVAL_MS);
      stagnantPollCountRef.current = 0;
      lastStatusRef.current = null;
      lastProcessedPollAtRef.current = 0;
    }
  }, [enabled]);

  const isPolling = enabled && !isDone;

  const { data, dataUpdatedAt } = useQuery({
    queryKey: ['enrichment-status'],
    queryFn: ({ signal: _signal }) => getSpotifyImportPollSnapshot(),
    enabled: isPolling,
    refetchInterval: isPolling ? pollIntervalMs : false,
    gcTime: 0,
    staleTime: 0,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const enrichmentStatus = data?.enrichmentStatus ?? {};
  const aggregateStatus = data?.aggregateEnrichmentStatus ?? 'idle';

  useEffect(() => {
    if (!data || !isPolling || dataUpdatedAt === 0) return;
    if (lastProcessedPollAtRef.current === dataUpdatedAt) return;
    lastProcessedPollAtRef.current = dataUpdatedAt;

    if (aggregateStatus === lastStatusRef.current) {
      stagnantPollCountRef.current += 1;
    } else {
      lastStatusRef.current = aggregateStatus;
      stagnantPollCountRef.current = 0;
      if (pollIntervalMs !== POLL_INTERVAL_MS) {
        setPollIntervalMs(POLL_INTERVAL_MS);
      }
    }

    if (
      aggregateStatus === 'enriching' &&
      stagnantPollCountRef.current >= IDLE_POLLS_BEFORE_BACKOFF &&
      pollIntervalMs !== BACKOFF_POLL_INTERVAL_MS
    ) {
      setPollIntervalMs(BACKOFF_POLL_INTERVAL_MS);
    }

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
  }, [data, dataUpdatedAt, isPolling, aggregateStatus, pollIntervalMs]);

  return {
    enrichmentStatus,
    aggregateStatus,
    isEnriching: aggregateStatus === 'enriching',
    isComplete: aggregateStatus === 'complete',
    isFailed: aggregateStatus === 'failed',
    isPartial: aggregateStatus === 'partial',
  };
}

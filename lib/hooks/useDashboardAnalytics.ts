'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
  DashboardAnalyticsView,
} from '@/types/analytics';

type AnalyticsState = {
  data: DashboardAnalyticsResponse | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  lastUpdatedAt: number | null;
};

type CacheEntry = {
  data: DashboardAnalyticsResponse;
  expiresAt: number;
  lastUpdatedAt: number;
};

const DEFAULT_TTL_MS = 5_000;

const clientCache = new Map<string, CacheEntry>();

type FetchAnalyticsError = Error & { status?: number };

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const maybeStatus = (error as { status?: unknown }).status;
  return typeof maybeStatus === 'number' ? maybeStatus : null;
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError';
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const id = window.setTimeout(resolve, ms);
    const onAbort = () => {
      window.clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function getKeyWithView(
  range: AnalyticsRange,
  view: DashboardAnalyticsView
): string {
  return `dashboard-analytics:${view}:${range}`;
}

function isRange(value: string): value is AnalyticsRange {
  return (
    value === '1d' ||
    value === '7d' ||
    value === '30d' ||
    value === '90d' ||
    value === 'all'
  );
}

async function fetchAnalytics(
  range: AnalyticsRange,
  view: DashboardAnalyticsView,
  signal: AbortSignal,
  forceRefresh: boolean
): Promise<DashboardAnalyticsResponse> {
  const qs = new URLSearchParams({ range, view });
  if (forceRefresh) qs.set('refresh', '1');

  const res = await fetch(`/api/dashboard/analytics?${qs.toString()}`, {
    method: 'GET',
    signal,
    headers: forceRefresh ? { 'Cache-Control': 'no-cache' } : undefined,
  });

  if (!res.ok) {
    const error = new Error(
      `Failed to fetch analytics (${res.status})`
    ) as FetchAnalyticsError;
    error.status = res.status;
    throw error;
  }

  const json = (await res.json()) as unknown;
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid analytics response');
  }

  return json as DashboardAnalyticsResponse;
}

export type UseDashboardAnalyticsOptions = {
  range?: AnalyticsRange;
  view?: DashboardAnalyticsView;
  ttlMs?: number;
};

export function useDashboardAnalytics(
  options: UseDashboardAnalyticsOptions = {}
) {
  const range: AnalyticsRange = useMemo(() => {
    const provided = options.range;
    if (!provided) return '7d';
    return isRange(provided) ? provided : '7d';
  }, [options.range]);

  const view: DashboardAnalyticsView = useMemo(() => {
    return options.view ?? 'traffic';
  }, [options.view]);

  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  const [state, setState] = useState<AnalyticsState>({
    data: null,
    error: null,
    loading: true,
    refreshing: false,
    lastUpdatedAt: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (forceRefresh: boolean) => {
      const key = getKeyWithView(range, view);
      const now = Date.now();
      const cached = clientCache.get(key);

      if (!forceRefresh && cached && cached.expiresAt > now) {
        setState(prev => ({
          ...prev,
          data: cached.data,
          error: null,
          loading: false,
          refreshing: false,
          lastUpdatedAt: cached.lastUpdatedAt,
        }));
        return;
      }

      if (!forceRefresh && cached) {
        setState(prev => ({
          ...prev,
          data: cached.data,
          error: null,
          loading: false,
          refreshing: true,
          lastUpdatedAt: cached.lastUpdatedAt,
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: null,
          loading: prev.data ? false : true,
          refreshing: Boolean(prev.data),
        }));
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const run = async (): Promise<DashboardAnalyticsResponse> => {
          try {
            return await fetchAnalytics(
              range,
              view,
              controller.signal,
              forceRefresh
            );
          } catch (error) {
            if (controller.signal.aborted || isAbortError(error)) throw error;

            const status = getErrorStatus(error);
            if (status === 401 && !forceRefresh) {
              await sleep(200, controller.signal);
              return await fetchAnalytics(
                range,
                view,
                controller.signal,
                forceRefresh
              );
            }

            throw error;
          }
        };

        const result = await run();
        const updatedAt = Date.now();
        clientCache.set(key, {
          data: result,
          expiresAt: updatedAt + ttlMs,
          lastUpdatedAt: updatedAt,
        });

        setState({
          data: result,
          error: null,
          loading: false,
          refreshing: false,
          lastUpdatedAt: updatedAt,
        });
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        const message =
          error instanceof Error ? error.message : 'Unable to load analytics';
        setState(prev => ({
          ...prev,
          error: message,
          loading: false,
          refreshing: false,
        }));
      }
    },
    [range, ttlMs, view]
  );

  useEffect(() => {
    void load(false);
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  return {
    range,
    data: state.data,
    error: state.error,
    loading: state.loading,
    refreshing: state.refreshing,
    lastUpdatedAt: state.lastUpdatedAt,
    refresh,
  };
}

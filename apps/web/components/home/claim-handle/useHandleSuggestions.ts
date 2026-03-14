'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithTimeout, queryKeys } from '@/lib/queries';

const MAX_SUGGESTIONS = 4;
const DEBOUNCE_MS = 350;

export interface HandleSuggestion {
  readonly handle: string;
  readonly available: boolean;
}

const unique = (values: string[]): string[] => [...new Set(values)];

function toSuggestionCandidates(baseHandle: string): string[] {
  const normalized = baseHandle.toLowerCase();
  const suffixes = ['music', 'official', 'live'];

  return unique([
    normalized,
    ...suffixes.map(suffix => `${normalized}${suffix}`),
    `${normalized}hq`,
  ]).slice(0, MAX_SUGGESTIONS);
}

interface HandleCheckResponse {
  available?: boolean;
}

async function fetchHandleSuggestions(
  candidates: string[],
  signal?: AbortSignal
): Promise<HandleSuggestion[]> {
  const checks = await Promise.all(
    candidates.map(async candidate => {
      try {
        const payload = await fetchWithTimeout<HandleCheckResponse>(
          `/api/handle/check?handle=${encodeURIComponent(candidate)}`,
          { signal, timeout: 5_000 }
        );
        return {
          handle: candidate,
          available: Boolean(payload.available),
        } satisfies HandleSuggestion;
      } catch {
        return null;
      }
    })
  );

  return checks.filter((value): value is HandleSuggestion => !!value);
}

export function useHandleSuggestions(
  handle: string,
  disabled: boolean
): {
  readonly suggestions: HandleSuggestion[];
  readonly checkingSuggestions: boolean;
} {
  const [debouncedHandle, setDebouncedHandle] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the handle input
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (disabled || !handle) {
      setDebouncedHandle('');
      return;
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedHandle(handle);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [handle, disabled]);

  const candidates = useMemo(() => {
    if (!debouncedHandle) {
      return [];
    }
    return toSuggestionCandidates(debouncedHandle);
  }, [debouncedHandle]);

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: queryKeys.handle.suggestions(candidates),
    queryFn: ({ signal }) => fetchHandleSuggestions(candidates, signal),
    enabled: candidates.length > 0,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Show checking state when debounce is pending or query is fetching
  const isDebouncing =
    !disabled && Boolean(handle) && handle !== debouncedHandle;
  const checkingSuggestions = isDebouncing || isFetching;

  return { suggestions, checkingSuggestions };
}

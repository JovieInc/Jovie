'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const MAX_SUGGESTIONS = 4;
const DEBOUNCE_MS = 350;
const FETCH_TIMEOUT_MS = 5_000;

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

export function useHandleSuggestions(
  handle: string,
  disabled: boolean
): {
  readonly suggestions: HandleSuggestion[];
  readonly checkingSuggestions: boolean;
} {
  const [suggestions, setSuggestions] = useState<HandleSuggestion[]>([]);
  const [checkingSuggestions, setCheckingSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const candidates = useMemo(() => {
    if (!handle) {
      return [];
    }
    return toSuggestionCandidates(handle);
  }, [handle]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    abortRef.current?.abort();

    if (disabled || candidates.length === 0) {
      setSuggestions([]);
      setCheckingSuggestions(false);
      return;
    }

    setCheckingSuggestions(true);

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const checks = await Promise.all(
          candidates.map(async candidate => {
            const response = await fetch(
              `/api/handle/check?handle=${encodeURIComponent(candidate)}`,
              { signal: controller.signal }
            );

            if (!response.ok) {
              return null;
            }

            const payload = (await response.json()) as { available?: boolean };
            return {
              handle: candidate,
              available: Boolean(payload.available),
            } satisfies HandleSuggestion;
          })
        );

        clearTimeout(timeoutId);
        if (controller.signal.aborted) {
          return;
        }

        setSuggestions(
          checks.filter((value): value is HandleSuggestion => !!value)
        );
        setCheckingSuggestions(false);
      } catch {
        clearTimeout(timeoutId);
        setSuggestions([]);
        setCheckingSuggestions(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      abortRef.current?.abort();
    };
  }, [candidates, disabled]);

  return { suggestions, checkingSuggestions };
}

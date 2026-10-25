'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LAST_LOOKED_KEY,
  type LastLookedSummary,
  type LookedSnapshot,
  MIN_LOOK_GAP_MS,
  parseSnapshot,
  summarizeSinceLastLooked,
} from '@/lib/ovie/home/since-last-looked';

const BASELINE_KEY = `${LAST_LOOKED_KEY}.baseline`;
const WRITE_EVERY_MS = 30_000;

function read(key: string): LookedSnapshot | null {
  try {
    return parseSnapshot(globalThis.localStorage?.getItem(key) ?? null);
  } catch {
    return null;
  }
}

function write(key: string, snapshot: LookedSnapshot): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Per-browser convenience: Home renders the same without it.
  }
}

/**
 * Compare the live numbers with the last visit. The baseline is the snapshot
 * left behind when this visit began; reloads inside MIN_LOOK_GAP_MS keep the
 * earlier baseline so a refresh never erases what changed. `current` is null
 * until the sources load, so a half-loaded Home never writes a partial look.
 */
export function useOvieLastLooked(
  current: LookedSnapshot | null
): LastLookedSummary | null {
  const [baseline, setBaseline] = useState<LookedSnapshot | null>(null);
  const started = useRef(false);
  const lastWrite = useRef(0);

  useEffect(() => {
    if (started.current || !current) return;
    started.current = true;
    const lastSeen = read(LAST_LOOKED_KEY);
    const priorBaseline = read(BASELINE_KEY);
    const next =
      lastSeen && current.at - lastSeen.at >= MIN_LOOK_GAP_MS
        ? lastSeen
        : (priorBaseline ?? lastSeen);
    if (next) {
      write(BASELINE_KEY, next);
      setBaseline(next);
    }
  }, [current]);

  useEffect(() => {
    if (!current) return;
    const save = () => {
      lastWrite.current = current.at;
      write(LAST_LOOKED_KEY, current);
    };
    if (current.at - lastWrite.current >= WRITE_EVERY_MS) save();
    const onHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    document.addEventListener('visibilitychange', onHide);
    globalThis.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      globalThis.removeEventListener('pagehide', save);
    };
  }, [current]);

  return useMemo(
    () =>
      baseline && current ? summarizeSinceLastLooked(baseline, current) : null,
    [baseline, current]
  );
}

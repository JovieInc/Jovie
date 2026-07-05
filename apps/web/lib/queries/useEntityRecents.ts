'use client';

/**
 * Entity Recents Store (JOV / GH-11943)
 *
 * The slash/entity picker's "own graph" tier starts with the entities the
 * creator has recently referenced. We persist them per-profile in
 * `localStorage` and expose them through `useSyncExternalStore` so every picker
 * instance (composer slash menu + ChatInput's `activeEntity` reader) stays in
 * sync the instant a new entity is tagged — with zero network latency.
 *
 * Stored as full `EntityRef`s (id + label + thumbnail + meta) so a recent row
 * renders identically to a freshly-fetched one and can be tagged offline.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { EntityRef } from '@/lib/commands/entities';

const STORAGE_PREFIX = 'jovie:entity-recents:v1:';
const MAX_RECENTS = 16;
const EMPTY: readonly EntityRef[] = Object.freeze([]);

// Per-profile snapshot cache. Each entry holds the SAME array reference until
// `record` replaces it, which is what keeps `getSnapshot` stable across renders
// (a fresh array every call would make useSyncExternalStore loop forever).
const cache = new Map<string, readonly EntityRef[]>();
const listeners = new Set<() => void>();

function storageKey(profileId: string): string {
  return `${STORAGE_PREFIX}${profileId}`;
}

function refKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

function isEntityRef(value: unknown): value is EntityRef {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as Partial<EntityRef>;
  return (
    typeof ref.id === 'string' &&
    typeof ref.kind === 'string' &&
    typeof ref.label === 'string'
  );
}

function readStorage(profileId: string): readonly EntityRef[] {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(storageKey(profileId));
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const refs = parsed.filter(isEntityRef).slice(0, MAX_RECENTS);
    return refs.length > 0 ? Object.freeze(refs) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(profileId: string): readonly EntityRef[] {
  // Fail closed: a blank profile id must never read or cache shared storage.
  if (!profileId) return EMPTY;
  const cached = cache.get(profileId);
  if (cached !== undefined) return cached;
  const loaded = readStorage(profileId);
  cache.set(profileId, loaded);
  return loaded;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function recordRecent(profileId: string, ref: EntityRef): void {
  if (!profileId || typeof window === 'undefined' || !isEntityRef(ref)) return;
  const key = refKey(ref);
  const current = getSnapshot(profileId);
  const next = Object.freeze(
    [ref, ...current.filter(existing => refKey(existing) !== key)].slice(
      0,
      MAX_RECENTS
    )
  );
  cache.set(profileId, next);
  try {
    window.localStorage.setItem(storageKey(profileId), JSON.stringify(next));
  } catch {
    // Quota exceeded or storage disabled — the in-memory snapshot still updates
    // so the picker reflects the tag for this session.
  }
  for (const listener of listeners) listener();
}

export interface UseEntityRecentsResult {
  readonly recents: readonly EntityRef[];
  readonly record: (ref: EntityRef) => void;
}

export function useEntityRecents(profileId: string): UseEntityRecentsResult {
  const recents = useSyncExternalStore(
    subscribe,
    () => getSnapshot(profileId),
    () => EMPTY
  );
  const record = useCallback(
    (ref: EntityRef) => recordRecent(profileId, ref),
    [profileId]
  );
  return { recents, record };
}

/** Test-only: drop the in-memory cache + listeners between specs. */
export function __resetEntityRecentsForTest(): void {
  cache.clear();
  listeners.clear();
}

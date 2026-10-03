'use client';

import { type SetStateAction, useCallback, useSyncExternalStore } from 'react';

/** One mounted chat owns one text source; persistence remains conversation-keyed. */
export function createComposerDraft(initialValue: string) {
  let value = initialValue;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    getServerSnapshot: () => initialValue,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (update: SetStateAction<string>) => {
      const next = typeof update === 'function' ? update(value) : update;
      if (next === value) return;
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

export type ComposerDraft = ReturnType<typeof createComposerDraft>;

export function useComposerDraft(draft: ComposerDraft): string {
  return useSyncExternalStore(
    draft.subscribe,
    draft.getSnapshot,
    draft.getServerSnapshot
  );
}

/** Thread owners do not subscribe to characters or to irrelevant empty-state intent. */
export function useComposerDraftIntent(draft: ComposerDraft, enabled: boolean) {
  const getSnapshot = useCallback(
    () => enabled && draft.getSnapshot().trim().length > 0,
    [draft, enabled]
  );
  const getServerSnapshot = useCallback(
    () => enabled && draft.getServerSnapshot().trim().length > 0,
    [draft, enabled]
  );
  return useSyncExternalStore(draft.subscribe, getSnapshot, getServerSnapshot);
}

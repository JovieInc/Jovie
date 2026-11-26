/** Mutable composer draft for JovieChat tests that assert draft-intent melt. */
export function createMockComposerDraft(initialValue = '') {
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
    set: (update: string | ((prev: string) => string)) => {
      const next = typeof update === 'function' ? update(value) : update;
      if (next === value) return;
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

export type MockComposerDraft = ReturnType<typeof createMockComposerDraft>;

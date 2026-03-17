'use client';

import { useCallback, useRef } from 'react';

export type CursorPosition = 'start' | 'end' | number | null;

export function useInputFocusController<T extends HTMLInputElement>() {
  const inputRef = useRef<T>(null);

  const focusInput = useCallback((cursor: CursorPosition = 'end') => {
    requestAnimationFrame(() => {
      const element = inputRef.current;
      if (!element) return;

      element.focus();

      if (cursor === null) return;

      let position: number;
      if (cursor === 'end') {
        position = element.value.length;
      } else if (cursor === 'start') {
        position = 0;
      } else {
        position = cursor;
      }

      try {
        element.setSelectionRange(position, position);
      } catch {
        // Some input types might not support selection range; ignore.
      }
    });
  }, []);

  return { inputRef, focusInput } as const;
}

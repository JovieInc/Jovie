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

      const position =
        cursor === 'end'
          ? element.value.length
          : cursor === 'start'
            ? 0
            : cursor;

      try {
        element.setSelectionRange(position, position);
      } catch {
        // Some input types might not support selection range; ignore.
      }
    });
  }, []);

  return { inputRef, focusInput } as const;
}

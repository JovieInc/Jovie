'use client';

import React from 'react';
import { isFormElement } from '@/lib/utils/keyboard';

const RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE = ']';

export function useRightRailKeyboardShortcut(onToggle: () => void) {
  const handlerRef = React.useRef(onToggle);

  React.useEffect(() => {
    handlerRef.current = onToggle;
  }, [onToggle]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      if (!key) return;

      // Bare `]` mirrors the sidebar's `[` shortcut. Suppress while focus is in
      // an editable surface so typing in chat/inputs is not hijacked.
      if (
        key === RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isFormElement(event.target)
      ) {
        event.preventDefault();
        handlerRef.current();
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, []);
}

export { RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE };

'use client';

import React from 'react';
import { isFormElement } from '@/lib/utils/keyboard';

const SIDEBAR_KEYBOARD_SHORTCUT = 'b';
const SIDEBAR_KEYBOARD_SHORTCUT_BARE = '[';

export function useSidebarKeyboardShortcut(
  onToggle: () => void,
  shortcutKey: string = SIDEBAR_KEYBOARD_SHORTCUT
) {
  const handlerRef = React.useRef(onToggle);

  React.useEffect(() => {
    handlerRef.current = onToggle;
  }, [onToggle]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key?.toLowerCase();
      if (!key) return;

      // Modified shortcut: Cmd/Ctrl + B (legacy alias, still wired).
      if (
        key === shortcutKey.toLowerCase() &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        handlerRef.current();
        return;
      }

      // Bare `[` is the New Design shortcut. Suppress while focus is in an
      // editable surface so typing in chat/inputs is not hijacked.
      if (
        key === SIDEBAR_KEYBOARD_SHORTCUT_BARE &&
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
  }, [shortcutKey]);
}

export { SIDEBAR_KEYBOARD_SHORTCUT, SIDEBAR_KEYBOARD_SHORTCUT_BARE };

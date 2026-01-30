'use client';

import React from 'react';

const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

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
      if (
        event.key.toLowerCase() === shortcutKey.toLowerCase() &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        handlerRef.current();
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [shortcutKey]);
}

export { SIDEBAR_KEYBOARD_SHORTCUT };

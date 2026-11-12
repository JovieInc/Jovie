'use client';

import { useEffect, useState } from 'react';

const CHROME_IDLE_MS = 2500;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) ||
    target.getAttribute('role') === 'slider' ||
    target.getAttribute('role') === 'tab'
  );
}

/**
 * Quiet chrome while talking: the dock fades after a pause in recording and
 * returns on any pointer move.
 */
export function useStudioChromeVisible(isRecording: boolean): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!isRecording) {
      setVisible(true);
      return;
    }
    let timer = globalThis.setTimeout(() => setVisible(false), CHROME_IDLE_MS);
    const wake = () => {
      setVisible(true);
      globalThis.clearTimeout(timer);
      timer = globalThis.setTimeout(() => setVisible(false), CHROME_IDLE_MS);
    };
    globalThis.window.addEventListener('pointermove', wake);
    return () => {
      globalThis.clearTimeout(timer);
      globalThis.window.removeEventListener('pointermove', wake);
    };
  }, [isRecording]);

  return visible;
}

interface StudioShortcutHandlers {
  /** Escape: stop a take, close an open panel, or leave the studio. */
  readonly onEscape: () => void;
  /** Space outside a control: start or stop a take. */
  readonly onToggleRecording: () => void;
}

export function useStudioShortcuts({
  onEscape,
  onToggleRecording,
}: StudioShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key === ' ' && !isTypingTarget(event.target)) {
        event.preventDefault();
        onToggleRecording();
      }
    };
    globalThis.window.addEventListener('keydown', onKeyDown);
    return () => globalThis.window.removeEventListener('keydown', onKeyDown);
  }, [onEscape, onToggleRecording]);
}

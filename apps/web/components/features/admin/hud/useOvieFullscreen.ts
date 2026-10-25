'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isElectronRuntime } from '@/lib/desktop/electron-bridge';
import {
  FULLSCREEN_STORAGE_KEY,
  FULLSCREEN_TOGGLE_EVENT,
  matchesFullscreenShortcut,
} from '@/lib/ovie/home/fullscreen-mode';

function readStored(): boolean {
  try {
    return localStorage.getItem(FULLSCREEN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStored(on: boolean): void {
  try {
    localStorage.setItem(FULLSCREEN_STORAGE_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the toggle still works for this page load.
  }
}

/**
 * Full screen state for Ovie Home. On: `?fullscreen=1` (kiosk launch) or the
 * per-device preference. Toggle: icon button, Cmd+Shift+F (Ctrl+Cmd+F too in
 * the Mac app), the `ovie:fullscreen-toggle` event, Esc to leave. In the Mac
 * app it also enters native fullscreen (needs the user gesture, so it applies
 * on toggle, not on a persisted reload).
 */
export function useOvieFullscreen(options?: { readonly force?: boolean }) {
  const force = options?.force === true;
  const fromUrl = useSearchParams()?.get('fullscreen') === '1';
  const [on, setOn] = useState(false);
  const [inDesktopApp, setInDesktopApp] = useState(false);
  const nativeRef = useRef(false);

  useEffect(() => {
    setInDesktopApp(isElectronRuntime());
    setOn(force || fromUrl || readStored());
  }, [force, fromUrl]);

  const set = useCallback((next: boolean, gesture: boolean) => {
    setOn(next);
    writeStored(next);
    if (!gesture) return;
    if (next && isElectronRuntime() && !document.fullscreenElement) {
      nativeRef.current = true;
      void document.documentElement.requestFullscreen().catch(() => {
        nativeRef.current = false;
      });
    } else if (!next && document.fullscreenElement) {
      nativeRef.current = false;
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const toggle = useCallback(() => set(!on, true), [on, set]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (force) return;
      if (matchesFullscreenShortcut(event, inDesktopApp)) {
        event.preventDefault();
        set(!on, true);
      } else if (event.key === 'Escape' && on) {
        set(false, true);
      }
    };
    const onEvent = () => set(!on, false);
    const onNativeChange = () => {
      // Leaving native fullscreen (the OS consumes Esc) leaves Full screen too.
      if (nativeRef.current && !document.fullscreenElement) {
        nativeRef.current = false;
        set(false, false);
      }
    };
    globalThis.addEventListener('keydown', onKey);
    globalThis.addEventListener(FULLSCREEN_TOGGLE_EVENT, onEvent);
    document.addEventListener('fullscreenchange', onNativeChange);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
      globalThis.removeEventListener(FULLSCREEN_TOGGLE_EVENT, onEvent);
      document.removeEventListener('fullscreenchange', onNativeChange);
    };
  }, [force, inDesktopApp, on, set]);

  return { on, toggle, inDesktopApp };
}

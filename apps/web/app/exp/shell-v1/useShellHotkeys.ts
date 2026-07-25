'use client';

import { type Dispatch, type SetStateAction, useEffect } from 'react';
import type { CanvasView } from './shell-v1-types';

export type ShellHotkeyState = {
  setBarCollapsed: Dispatch<SetStateAction<boolean>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setJovieListening: Dispatch<SetStateAction<boolean>>;
  setSidebarMode: Dispatch<SetStateAction<'docked' | 'floating'>>;
  setView: Dispatch<SetStateAction<CanvasView>>;
  setWaveformOn: Dispatch<SetStateAction<boolean>>;
  view: CanvasView;
};

export function useShellHotkeys({
  setBarCollapsed,
  setIsPlaying,
  setJovieListening,
  setSidebarMode,
  setView,
  setWaveformOn,
  view,
}: ShellHotkeyState) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      // Jovie push-to-talk works even from inside fields (it's the universal
      // command surface). Other shortcuts respect text-input focus.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        setJovieListening(true);
        return;
      }
      if (inField) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (
        e.key === '[' ||
        (e.key === 'Tab' &&
          !e.shiftKey &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey)
      ) {
        e.preventDefault();
        setSidebarMode(m => (m === 'docked' ? 'floating' : 'docked'));
      } else if (
        ((e.metaKey || e.ctrlKey) && e.key === '\\') ||
        e.key === '`'
      ) {
        e.preventDefault();
        setBarCollapsed(v => !v);
      } else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        setWaveformOn(v => !v);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setView(v => (v === 'lyrics' ? 'demo' : 'lyrics'));
      } else if (e.key === 'Escape' && view === 'lyrics') {
        e.preventDefault();
        setView('demo');
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (
        e.key === 'Meta' ||
        e.key === 'Control' ||
        e.key === 'j' ||
        e.key === 'J'
      ) {
        setJovieListening(false);
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    setBarCollapsed,
    setIsPlaying,
    setJovieListening,
    setSidebarMode,
    setView,
    setWaveformOn,
    view,
  ]);
}

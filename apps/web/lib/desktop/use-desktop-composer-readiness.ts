'use client';

import { type RefObject, useEffect } from 'react';
import { useJovieAuth } from '@/hooks/useJovieAuth';
import {
  isElectronRuntime,
  notifyDesktopComposerReadiness,
} from './electron-bridge';

/** Passive observation: never focus/type, fetch auth, or wait for a model response. */
export function useDesktopComposerReadiness(
  ref: RefObject<HTMLTextAreaElement | null>,
  conversationReady: boolean
): void {
  const { isLoaded, isSignedIn } = useJovieAuth();
  useEffect(() => {
    const input = ref.current;
    if (
      !input ||
      !conversationReady ||
      !isLoaded ||
      !isSignedIn ||
      !isElectronRuntime()
    )
      return;
    let frame: number | null = null;
    let visibleSent = false;
    let focusedSent = false;
    let disposed = false;
    const usable = () => {
      if (
        !input.isConnected ||
        input.disabled ||
        input.readOnly ||
        input.closest('[inert]') ||
        document.visibilityState !== 'visible' ||
        (typeof input.checkVisibility === 'function' &&
          !input.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          }))
      )
        return false;
      const rect = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      return (
        style.visibility === 'visible' &&
        Number(style.opacity || '1') > 0 &&
        style.display !== 'none' &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < innerHeight &&
        rect.left < innerWidth
      );
    };
    const observe = async () => {
      frame = null;
      if (disposed || !usable()) return;
      if (!visibleSent)
        visibleSent = await notifyDesktopComposerReadiness('visible-editable');
      if (disposed || !usable()) return;
      if (
        visibleSent &&
        !focusedSent &&
        document.hasFocus() &&
        document.activeElement === input
      )
        focusedSent = await notifyDesktopComposerReadiness('focused');
    };
    const schedule = () => {
      if (disposed || focusedSent || frame !== null) return;
      // rAF runs before paint. The second callback allows a paint opportunity;
      // it is explicitly not a compositor/pixel or input-latency measurement.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(observe);
      });
    };
    schedule();
    input.addEventListener('focus', schedule);
    globalThis.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', schedule);
    const resize =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(schedule);
    resize?.observe(input);
    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      input.removeEventListener('focus', schedule);
      globalThis.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', schedule);
      resize?.disconnect();
    };
  }, [conversationReady, isLoaded, isSignedIn, ref]);
}

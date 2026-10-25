'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type FullscreenFeedStatus,
  fullscreenDrift,
  fullscreenScale,
  shouldReloadFullscreen,
} from '@/lib/ovie/home/fullscreen-mode';

const RELOAD_KEY = 'ovie-fullscreen-reload';

/**
 * Full screen is the same Home, filling the display: the chrome is covered,
 * the surface is scaled for room-distance reading, nudged a few px a minute
 * against burn-in, kept awake, and reloaded after a long outage. Feed
 * staleness is not here: it shows on normal Home too (OvieFeedBanner).
 */
export function OvieFullscreenFrame({
  status,
  now,
  children,
}: Readonly<{
  status: FullscreenFeedStatus;
  now: number;
  children: ReactNode;
}>) {
  const [scale, setScale] = useState(1);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const downSince = useRef<number | null>(null);

  useEffect(() => {
    const fit = () =>
      setScale(fullscreenScale(globalThis.innerWidth, globalThis.innerHeight));
    fit();
    globalThis.addEventListener('resize', fit);
    return () => globalThis.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const hold = async () => {
      try {
        const wakeLock = (
          navigator as Navigator & {
            wakeLock?: { request: (type: 'screen') => Promise<typeof lock> };
          }
        ).wakeLock;
        lock = (await wakeLock?.request('screen')) ?? null;
      } catch {
        // Unsupported or denied: the display's own power settings apply.
      }
    };
    const rehold = () => {
      if (document.visibilityState === 'visible') void hold();
    };
    void hold();
    document.addEventListener('visibilitychange', rehold);
    return () => {
      document.removeEventListener('visibilitychange', rehold);
      void lock?.release();
    };
  }, []);

  useEffect(() => {
    if (status.level === 'down') downSince.current ??= now;
    else downSince.current = null;
    let lastReload: number | null = null;
    try {
      lastReload = Number(sessionStorage.getItem(RELOAD_KEY)) || null;
    } catch {
      // Storage blocked: the cooldown then resets per page load only.
    }
    if (
      shouldReloadFullscreen({
        level: status.level,
        downSinceMs: downSince.current,
        lastReloadMs: lastReload,
        nowMs: now,
      })
    ) {
      try {
        sessionStorage.setItem(RELOAD_KEY, String(now));
      } catch {
        // see above
      }
      globalThis.location.reload();
    }
  }, [status.level, now]);

  const drift = fullscreenDrift(now);
  // Portaled to <body>: the shell has transformed ancestors and its own
  // stacking, so a fixed child inside it would not cover the sidebar.
  if (!mounted) return null;
  return createPortal(
    <div
      className='fixed inset-0 z-[1000] cursor-none select-none overflow-hidden bg-base text-primary-token'
      data-testid='ovie-fullscreen'
      data-feed-level={status.level}
    >
      <div
        className='origin-top-left p-4'
        data-testid='ovie-fullscreen-canvas'
        style={{
          // The scaled canvas is exactly the viewport: (100vw / scale) * scale.
          boxSizing: 'border-box',
          width: `${100 / scale}vw`,
          height: `${100 / scale}vh`,
          transform: `scale(${scale}) translate(${drift.x}px, ${drift.y}px)`,
          transition: 'transform var(--ds-motion-cinematic-duration) linear',
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  type FullscreenFeedStatus,
  fullscreenDrift,
  fullscreenScale,
  shouldReloadFullscreen,
} from '@/lib/ovie/home/fullscreen-mode';

const RELOAD_KEY = 'ovie-fullscreen-reload';

/**
 * Full Screen scales the HUD for the display. It is the Home canvas only: the
 * Summer composer below it is the normal shared component, untouched. The
 * canvas is scaled to whichever axis of its own region is tighter, nudged a few
 * px a minute against burn-in, kept awake, and reloaded after a long outage.
 * Feed staleness is not here: it shows on normal Home too (OvieFeedBanner).
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
  const regionRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const downSince = useRef<number | null>(null);

  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    const fit = () =>
      setScale(fullscreenScale(region.clientWidth, region.clientHeight));
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(region);
    return () => observer.disconnect();
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
  return (
    <div
      ref={regionRef}
      className='relative h-full min-h-0 w-full overflow-hidden text-primary-token'
      data-testid='ovie-fullscreen'
      data-feed-level={status.level}
    >
      <div
        className='absolute left-0 top-0 origin-top-left p-4 [&_.truncate]:overflow-visible [&_.truncate]:whitespace-normal [&_.truncate]:text-clip [&_[class*=line-clamp]]:line-clamp-none'
        data-testid='ovie-fullscreen-canvas'
        style={{
          // Nothing truncates in Full Screen (shared organisms use .truncate
          // and line-clamp, so release them here instead of forking them).
          boxSizing: 'border-box',
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
          transform: `scale(${scale}) translate(${drift.x}px, ${drift.y}px)`,
          transition: 'transform var(--ds-motion-cinematic-duration) linear',
        }}
      >
        {children}
      </div>
    </div>
  );
}

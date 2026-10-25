'use client';

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
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
      // Below lg the home slot is content-sized, so there is no fixed region to
      // scale into: the canvas stays in flow at 1x. From lg it is scaled.
      className='relative w-full text-primary-token lg:h-full lg:min-h-0 lg:overflow-hidden'
      data-testid='ovie-fullscreen'
      data-feed-level={status.level}
    >
      <div
        // The scale is applied at once (no transition: a mid-transition canvas
        // is neither the old size nor the new). Drift is the inner wrapper.
        className='lg:absolute lg:left-0 lg:top-0 lg:origin-top-left lg:[height:var(--fs-h)] lg:[transform:var(--fs-scale)] lg:[width:var(--fs-w)]'
        data-testid='ovie-fullscreen-canvas'
        style={
          {
            '--fs-w': `${100 / scale}%`,
            '--fs-h': `${100 / scale}%`,
            '--fs-scale': `scale(${scale})`,
          } as CSSProperties
        }
      >
        <div
          className='h-full w-full p-4 [&_.truncate]:overflow-visible [&_.truncate]:whitespace-normal [&_.truncate]:text-clip [&_[class*=line-clamp]]:line-clamp-none'
          style={{
            // Nothing truncates in Full Screen (shared organisms use .truncate
            // and line-clamp, so release them here instead of forking them).
            transform: `translate(${drift.x}px, ${drift.y}px)`,
            transition: 'transform var(--ds-motion-cinematic-duration) linear',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

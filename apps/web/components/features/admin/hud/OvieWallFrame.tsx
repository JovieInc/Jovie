'use client';

import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  formatWallAge,
  shouldReloadWall,
  type WallFeed,
  wallDrift,
  wallFeedStatus,
  wallScale,
} from '@/lib/ovie/home/wall-mode';

const TICK_MS = 5_000;

/**
 * Wall mode shell for the office ultra-wide (`/app/ov?wall=1`): fills the
 * screen over the app shell, scales the same tokens up for room-distance
 * reading, drifts a few px a minute against burn-in, holds the screen awake,
 * refetches on wake/reconnect, reloads itself after a long outage, and says
 * so loudly when feeds stop. No interaction is needed or offered.
 */
export function OvieWallFrame({
  feeds,
  children,
}: Readonly<{ feeds: readonly WallFeed[]; children: ReactNode }>) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [scale, setScale] = useState(1);
  const downSince = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = globalThis.setInterval(tick, TICK_MS);
    return () => globalThis.clearInterval(id);
  }, []);

  useEffect(() => {
    const fit = () => setScale(wallScale(globalThis.innerWidth));
    fit();
    globalThis.addEventListener('resize', fit);
    return () => globalThis.removeEventListener('resize', fit);
  }, []);

  // Sleep, lid, network and tab-discard recovery: refetch everything on wake.
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
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      setNow(Date.now());
      void queryClient.refetchQueries({ type: 'active' });
      void hold();
    };
    void hold();
    document.addEventListener('visibilitychange', refresh);
    globalThis.addEventListener('online', refresh);
    globalThis.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      globalThis.removeEventListener('online', refresh);
      globalThis.removeEventListener('focus', refresh);
      void lock?.release();
    };
  }, [queryClient]);

  const status = wallFeedStatus(feeds, now);

  useEffect(() => {
    if (status.level === 'down') downSince.current ??= now;
    else downSince.current = null;
    let lastReload: number | null = null;
    try {
      lastReload = Number(sessionStorage.getItem('ovie-wall-reload')) || null;
    } catch {
      // Storage blocked: the cooldown then resets per page load only.
    }
    if (
      shouldReloadWall({
        level: status.level,
        downSinceMs: downSince.current,
        lastReloadMs: lastReload,
        nowMs: now,
      })
    ) {
      try {
        sessionStorage.setItem('ovie-wall-reload', String(now));
      } catch {
        // see above
      }
      globalThis.location.reload();
    }
  }, [status.level, now]);

  const drift = wallDrift(now);
  const clock = new Date(now).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className='fixed inset-0 z-50 overflow-hidden bg-base text-primary-token cursor-none select-none'
      data-testid='ovie-wall'
      data-feed-level={status.level}
    >
      <div
        className='origin-top-left'
        style={{
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
          transform: `scale(${scale}) translate(${drift.x}px, ${drift.y}px)`,
          transition: 'transform var(--ds-motion-cinematic-duration) linear',
        }}
      >
        <div className='flex h-full min-h-0 flex-col gap-3 p-4'>
          <header className='flex items-center justify-between gap-4'>
            <span className='text-sm font-semibold text-secondary-token'>
              Company
            </span>
            <span
              className='text-sm tabular-nums text-secondary-token'
              data-testid='ovie-wall-clock'
            >
              {clock}
            </span>
          </header>
          {status.level === 'live' ? null : (
            <div
              role='alert'
              data-testid='ovie-wall-stale'
              className={
                status.level === 'down'
                  ? 'rounded-lg border-2 border-error bg-surface-1 px-4 py-3 text-lg font-semibold text-error'
                  : 'rounded-lg border-2 border-warning bg-surface-1 px-4 py-3 text-lg font-semibold text-warning'
              }
            >
              {status.level === 'down' ? 'DATA DOWN' : 'DATA STALE'}
              {': '}
              {status.stale
                .map(item => `${item.id} ${formatWallAge(item.ageMs)}`)
                .join(' · ')}
              {'. Numbers below may be out of date.'}
            </div>
          )}
          <div className='min-h-0 flex-1'>{children}</div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

/**
 * The desktop profile surface's concrete component type, resolved at the
 * type level so this module never imports the surface at runtime.
 */
type DesktopSurfaceModule =
  typeof import('@/features/profile/templates/ProfileDesktopSurface');

export type DesktopSurfaceComponent =
  DesktopSurfaceModule['ProfileDesktopSurface'];

/**
 * Loads the desktop profile surface WITHOUT a lazy Suspense boundary, and
 * only when something can present it.
 *
 * The desktop dashboard is invisible below 1180px — the compact surface owns
 * every mobile width — but a static import makes every phone pay for it: the
 * module graph is parsed, the hidden subtree is hydrated, and the surface's
 * priority hero image is preloaded into the mobile critical path. That dead
 * weight regressed the weekly public-profile benchmark after the desktop
 * surface shipped by default (JOV-12207: LCP 5.5s vs 2.5s budget, JOV-12208:
 * TBT 436ms vs 200ms budget), so the chunk is fetched only when a >=1180px
 * viewport or an embedded preview host can render it.
 *
 * Importing on mount keeps the module a separate chunk (mirroring
 * `useProfileUnifiedDrawerModule`) with no suspend/retry lane: the module
 * lands in state — a stable, state-held component, never one created during
 * render — and renders the real surface once the fetch resolves. Once loaded
 * it stays loaded, so crossing the 1180px breakpoint does not refetch or
 * remount it. The caller renders the slot conditionally while null.
 */
export function useDesktopSurfaceModule(enabled: boolean) {
  const [Surface, setSurface] = useState<DesktopSurfaceComponent | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void import('@/features/profile/templates/ProfileDesktopSurface').then(
      mod => {
        if (!cancelled) setSurface(() => mod.ProfileDesktopSurface);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return Surface;
}

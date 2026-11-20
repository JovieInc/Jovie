'use client';

import { type ComponentProps, createElement, useEffect, useState } from 'react';
import type { ProfileUnifiedDrawer } from '@/features/profile/ProfileUnifiedDrawer';

/**
 * Loads the unified profile drawer WITHOUT a lazy boundary.
 *
 * next/dynamic (and any React.lazy wrapper) delays the drawer's first paint
 * by a Suspense suspend/retry cycle — measured at ~60-140ms after hydration
 * on every open with the module already in the browser (zero chunk fetches,
 * no long tasks), which is exactly the interval the deep-link pay arrival's
 * `usable-alias-result` budget gates on (JOV-7973: median 1000ms / p95
 * 1500ms; the tip alias is the only certified route whose destination
 * affordance is the drawer, so only it pays this tax).
 *
 * Importing once at mount keeps the module a separate chunk (routes that
 * embed this surface, like the /exp page builder, do not inherit its bytes
 * in first-load JS) while letting the chunk fetch overlap hydration. The
 * module lands in state, so the drawer renders synchronously in the same
 * commit the drawer-open state flips — no suspension, no retry lane.
 */
export function useProfileUnifiedDrawerModule():
  | typeof ProfileUnifiedDrawer
  | null {
  const [Drawer, setDrawer] = useState<typeof ProfileUnifiedDrawer | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    void import('@/features/profile/ProfileUnifiedDrawer').then(mod => {
      if (!cancelled) setDrawer(() => mod.ProfileUnifiedDrawer);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return Drawer;
}

/**
 * Renders the (lazily-resolved) unified drawer when its module has landed.
 * The surface mounts one of these per overlay slot; until the module
 * arrives it renders nothing — the drawer-open state only exists after
 * hydration, well after the fetch that starts at mount completes.
 */
export function ProfileUnifiedDrawerSlot(
  props: ComponentProps<typeof ProfileUnifiedDrawer>
): React.ReactNode {
  const Drawer = useProfileUnifiedDrawerModule();
  if (!Drawer) return null;
  return createElement(Drawer, props);
}

'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { ovieRouteKey } from '@/lib/ovie/route-usage';

/**
 * Counts each Ovie destination the operator opens (one beacon per route
 * change). Route templates only; see lib/ovie/route-usage.ts.
 */
export function OvieRouteUsageBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (!ovieRouteKey(pathname)) return;
    void fetch('/api/admin/hud/route-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);
  return null;
}

'use client';

import { useEffect } from 'react';
import { markNavigationDestinationReady } from '@/lib/tracking/navigation-telemetry';
import type { NavigationRouteBucket } from '@/lib/tracking/navigation-telemetry-contract';

/**
 * A destination-owned readiness signal. Mount it inside the usable surface,
 * and keep `ready` false while destination data is still loading.
 */
export function NavigationDestinationReady({
  destination,
  ready = true,
}: {
  readonly destination: NavigationRouteBucket;
  readonly ready?: boolean;
}) {
  useEffect(() => {
    if (ready) {
      markNavigationDestinationReady(destination);
    }
  }, [destination, ready]);

  return null;
}

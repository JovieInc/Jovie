'use client';

import { useEffect } from 'react';
import { trackProductFunnelEvent } from '@/lib/product-funnel/client';

interface ProductFunnelVisitBeaconProps {
  readonly sourceSurface: string;
}

export function ProductFunnelVisitBeacon({
  sourceSurface,
}: Readonly<ProductFunnelVisitBeaconProps>) {
  useEffect(() => {
    trackProductFunnelEvent({
      eventType: 'visit',
      sourceSurface,
      sourceRoute: globalThis.location.pathname,
    });
  }, [sourceSurface]);

  return null;
}

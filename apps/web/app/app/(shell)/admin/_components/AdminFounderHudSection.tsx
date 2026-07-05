import {
  FounderConversionHud,
  FounderConversionHudSkeleton,
} from '@/components/features/admin/hud/FounderConversionHud';
import { getFounderFunnelData } from '@/lib/admin/founder-funnel';
import { getAdminFunnelMetrics } from '@/lib/admin/funnel-metrics';

/**
 * Founder conversion HUD (#11500): visitor→pay funnel flowchart topped by
 * MRR + shipping velocity. MRR comes from the same `getAdminFunnelMetrics`
 * source as the admin hero so the numbers always reconcile; the funnel is
 * server-prefetched for the default range and range switches hydrate via
 * /api/admin/hud/founder-funnel on the client.
 */
export async function AdminFounderHudSection() {
  const [metrics, funnel] = await Promise.all([
    getAdminFunnelMetrics(),
    getFounderFunnelData('30d'),
  ]);

  return (
    <FounderConversionHud
      mrrUsd={metrics.stripeAvailable ? metrics.mrrUsd : null}
      initialFunnel={funnel}
    />
  );
}

export function AdminFounderHudSectionSkeleton() {
  return <FounderConversionHudSkeleton />;
}

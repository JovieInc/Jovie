'use client';

import { OvieCeoOverview } from '@/components/features/admin/hud/OvieCeoOverview';
import type { HudMetrics } from '@/types/hud';

export function HudCashMrrBand({
  metrics,
  onRetry,
}: Readonly<{
  readonly metrics: HudMetrics;
  readonly mrrValueClass: string;
  readonly runwayValueClass: string;
  readonly onRetry: () => void;
}>) {
  return <OvieCeoOverview metrics={metrics} onRetry={onRetry} />;
}

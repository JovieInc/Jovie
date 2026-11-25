import 'server-only';

import { getFounderFunnelData } from '@/lib/admin/founder-funnel';
import {
  founderFunnelView,
  requestedOpsFunnel,
} from '@/lib/analytics/funnel-view';
import { loadGoldenPathFunnel } from './certifications/golden-path-funnel.server';
import { buildFunnelOpsCard, type SummerOpsCard } from './ops-card';

export async function loadRequestedOpsFunnel(
  text: string
): Promise<SummerOpsCard | null> {
  const requested = requestedOpsFunnel(text);
  if (!requested) return null;

  const funnel =
    requested === 'golden-path'
      ? await loadGoldenPathFunnel()
      : founderFunnelView(
          await getFounderFunnelData(/\b7d\b/i.test(text) ? '7d' : '30d')
        );

  return buildFunnelOpsCard(funnel);
}

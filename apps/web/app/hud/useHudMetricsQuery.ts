import { useQuery } from '@tanstack/react-query';
import type { HudMetrics } from '@/types/hud';

const HUD_METRICS_KEY = ['hud', 'metrics'] as const;
const HUD_POLL_INTERVAL_MS = 30_000;

async function fetchHudMetrics(kioskToken: string | null): Promise<HudMetrics> {
  const url = new URL('/api/hud/metrics', window.location.origin);
  if (kioskToken) {
    url.searchParams.set('kiosk', kioskToken);
  }

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HUD metrics fetch failed (${response.status})`);
  }
  return response.json();
}

export function useHudMetricsQuery(
  initialData: HudMetrics,
  kioskToken: string | null,
) {
  return useQuery<HudMetrics>({
    queryKey: [...HUD_METRICS_KEY, kioskToken],
    queryFn: () => fetchHudMetrics(kioskToken),
    initialData,
    refetchInterval: HUD_POLL_INTERVAL_MS,
    staleTime: 0,
  });
}

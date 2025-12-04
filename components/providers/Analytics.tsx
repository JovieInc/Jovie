'use client';

import { useFeatureGate } from '@statsig/react-bindings';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import { computeRoute, SpeedInsights } from '@vercel/speed-insights/react';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { page, setAnalyticsEnabled } from '@/lib/analytics';
import { publicEnv } from '@/lib/env-public';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';

export function Analytics() {
  const pathname = usePathname();
  const params = useParams();
  const analyticsGate = useFeatureGate(STATSIG_FLAGS.ANALYTICS);
  const hasStatsigKey = Boolean(publicEnv.NEXT_PUBLIC_STATSIG_CLIENT_KEY);

  const normalizedParams = useMemo(() => {
    const entries = Object.entries(params ?? {});
    if (!entries.length) return null;
    const filtered = entries.filter(([, value]) => value !== undefined);
    if (!filtered.length) return null;
    return filtered.reduce<Record<string, string | string[]>>(
      (acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = value as string | string[];
        }
        return acc;
      },
      {}
    );
  }, [params]);

  const canonicalRoute = useMemo(() => {
    if (!pathname) return null;
    return computeRoute(pathname, normalizedParams);
  }, [normalizedParams, pathname]);

  const shouldLoadAnalytics = hasStatsigKey && analyticsGate.value;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAnalyticsEnabled(shouldLoadAnalytics);
  }, [shouldLoadAnalytics]);

  useEffect(() => {
    try {
      if (!hasStatsigKey) return;
      if (typeof window === 'undefined') return;
      if (!analyticsGate.value) return;

      page(pathname ?? undefined, {
        url: pathname ?? undefined,
      });
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }, [pathname, analyticsGate.value, hasStatsigKey]);

  if (!shouldLoadAnalytics) {
    return null;
  }

  return (
    <>
      <VercelAnalytics />
      <SpeedInsights route={canonicalRoute ?? pathname ?? null} />
    </>
  );
}

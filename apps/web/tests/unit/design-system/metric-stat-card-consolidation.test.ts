import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = resolve(import.meta.dirname, '../../..');

function readAppSource(relativePath: string): string {
  return readFileSync(resolve(APP_ROOT, relativePath), 'utf8');
}

describe('metric and stat card consolidation source contract', () => {
  it('keeps dashboard analytics stat cards on the content metric card owner', () => {
    const source = readAppSource(
      'components/features/dashboard/dashboard-analytics/DashboardAnalytics.tsx'
    );

    expect(source).toContain(
      "import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';"
    );
    expect(source).toContain(
      "import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';"
    );
    expect(source).not.toMatch(/^function StatCard\(/m);
    expect(source).not.toMatch(
      /if \(loading\) \{\s*return \(\s*<ContentSurfaceCard className='p-4 lg:p-5'>/
    );
  });

  it('keeps dashboard overview loading and error cards on the content metric card owner', () => {
    const source = readAppSource(
      'components/features/dashboard/organisms/DashboardAnalyticsCards.tsx'
    );

    expect(source).toContain(
      "import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';"
    );
    expect(source).toContain(
      "import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';"
    );
    expect(source).not.toMatch(/^function (SkeletonCards|ErrorCards)\(/m);
    expect(source).not.toContain('bg-sky-500/10');
    expect(source).not.toContain('bg-emerald-500/10');
  });

  it('keeps admin chart loading and empty states on the content chart state owner', () => {
    const shippingVelocitySource = readAppSource(
      'components/features/admin/ShippingVelocityChart.tsx'
    );
    const metricsChartSource = readAppSource(
      'components/features/admin/MetricsChart.tsx'
    );
    const metricsChartClientSource = readAppSource(
      'components/features/admin/MetricsChartClient.tsx'
    );

    for (const source of [
      shippingVelocitySource,
      metricsChartSource,
      metricsChartClientSource,
    ]) {
      expect(source).toContain(
        "from '@/components/molecules/ContentChartState'"
      );
    }

    expect(shippingVelocitySource).not.toMatch(/^function ChartSkeleton\(/m);
    expect(metricsChartSource).not.toContain('h-64 animate-pulse');
    expect(metricsChartClientSource).not.toContain(
      'METRICS_CHART_LOADING_CARD_KEYS'
    );
  });
});

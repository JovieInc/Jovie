import type { Metadata } from 'next';
import { ActivityTable } from '@/components/admin/activity-table';
import { DefaultStatusBanner } from '@/components/admin/DefaultStatusBanner';
import { KpiCards } from '@/components/admin/kpi-cards';
import { MetricsChart } from '@/components/admin/metrics-chart';
import { ReliabilityCard } from '@/components/admin/reliability-card';
import { getAdminMercuryMetrics } from '@/lib/admin/mercury-metrics';
import {
  getAdminActivityFeed,
  getAdminReliabilitySummary,
  getAdminUsageSeries,
} from '@/lib/admin/overview';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

interface AdminOverviewMetrics {
  mrrUsd: number;
  mrrGrowthMonthlyUsd: number;
  balanceUsd: number;
  burnRateUsd: number;
  runwayMonths: number | null;
  defaultStatus: 'alive' | 'dead';
  defaultStatusDetail: string;
}

export const metadata: Metadata = {
  title: 'Admin dashboard',
};

export const runtime = 'nodejs';

async function getAdminOverviewMetrics(): Promise<AdminOverviewMetrics> {
  try {
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated || !entitlements.isAdmin) {
      return {
        mrrUsd: 0,
        mrrGrowthMonthlyUsd: 0,
        balanceUsd: 0,
        burnRateUsd: 0,
        runwayMonths: null,
        defaultStatus: 'dead',
        defaultStatusDetail:
          'Admin access is required to evaluate default status.',
      };
    }

    const [stripeMetrics, mercuryMetrics] = await Promise.all([
      getAdminStripeOverviewMetrics(),
      getAdminMercuryMetrics(),
    ]);

    const monthlyRevenue = stripeMetrics.mrrUsd;
    const monthlyExpense = mercuryMetrics.burnRateUsd;
    const netBurn = monthlyExpense - monthlyRevenue;
    const runwayMonths =
      netBurn > 0 ? mercuryMetrics.balanceUsd / netBurn : null;

    const revenueGrowthMonthly = stripeMetrics.mrrGrowthMonthlyUsd;
    const monthsToProfitability =
      netBurn > 0 && revenueGrowthMonthly > 0
        ? netBurn / revenueGrowthMonthly
        : null;

    const isDefaultAlive =
      netBurn <= 0 ||
      (monthsToProfitability != null &&
        runwayMonths != null &&
        monthsToProfitability <= runwayMonths);

    let defaultStatusDetail = '';
    if (netBurn <= 0) {
      defaultStatusDetail =
        'Revenue already exceeds spend at the current run rate.';
    } else if (monthsToProfitability == null) {
      defaultStatusDetail =
        'Revenue growth is not yet outpacing burn at the current trajectory.';
    } else if (runwayMonths == null) {
      defaultStatusDetail = 'Runway is currently unlimited based on cash flow.';
    } else if (isDefaultAlive) {
      defaultStatusDetail = `Runway covers roughly ${monthsToProfitability.toFixed(
        1
      )} months to profitability.`;
    } else {
      defaultStatusDetail =
        'At the current growth rate, runway ends before profitability.';
    }

    return {
      mrrUsd: stripeMetrics.mrrUsd,
      mrrGrowthMonthlyUsd: stripeMetrics.mrrGrowthMonthlyUsd,
      balanceUsd: mercuryMetrics.balanceUsd,
      burnRateUsd: mercuryMetrics.burnRateUsd,
      runwayMonths,
      defaultStatus: isDefaultAlive ? 'alive' : 'dead',
      defaultStatusDetail,
    };
  } catch (error) {
    console.error('Error computing admin overview metrics:', error);
    return {
      mrrUsd: 0,
      mrrGrowthMonthlyUsd: 0,
      balanceUsd: 0,
      burnRateUsd: 0,
      runwayMonths: null,
      defaultStatus: 'dead',
      defaultStatusDetail:
        'Unable to compute default status due to a metrics error.',
    };
  }
}

export default async function AdminPage() {
  const metrics = await getAdminOverviewMetrics();

  const [usageSeries, reliabilitySummary, activityItems] = await Promise.all([
    getAdminUsageSeries(14),
    getAdminReliabilitySummary(),
    getAdminActivityFeed(20),
  ]);

  return (
    <div className='space-y-8'>
      <header className='space-y-2'>
        <p className='text-xs uppercase tracking-wide text-tertiary-token'>
          Internal
        </p>
        <h1 className='text-3xl font-semibold text-primary-token'>
          Admin dashboard
        </h1>
        <p className='text-sm text-secondary-token'>
          High-level KPIs, usage trends, and operational signals for Jovie.
          Admin-only access.
        </p>
      </header>

      <DefaultStatusBanner
        status={metrics.defaultStatus}
        detail={metrics.defaultStatusDetail}
        runwayMonths={metrics.runwayMonths}
        mrrGrowthMonthlyUsd={metrics.mrrGrowthMonthlyUsd}
      />

      <section id='users' className='space-y-4'>
        <KpiCards
          mrrUsd={metrics.mrrUsd}
          balanceUsd={metrics.balanceUsd}
          burnRateUsd={metrics.burnRateUsd}
          runwayMonths={metrics.runwayMonths}
        />
      </section>

      <section id='usage' className='grid gap-6 lg:grid-cols-3'>
        <div className='lg:col-span-2'>
          <MetricsChart points={usageSeries} />
        </div>
        <div id='errors' className='h-full'>
          <ReliabilityCard summary={reliabilitySummary} />
        </div>
      </section>

      <section id='activity'>
        <ActivityTable items={activityItems} />
      </section>
    </div>
  );
}

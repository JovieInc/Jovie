import { sql as drizzleSql } from 'drizzle-orm';
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
import { db, waitlistEntries } from '@/lib/db';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

interface DataAvailability {
  isConfigured: boolean;
  isAvailable: boolean;
  errorMessage?: string;
}

interface AdminOverviewMetrics {
  mrrUsd: number;
  mrrGrowth30dUsd: number;
  activeSubscribers: number;
  balanceUsd: number;
  burnRateUsd: number;
  runwayMonths: number | null;
  defaultStatus: 'alive' | 'dead';
  defaultStatusDetail: string;
  waitlistCount: number;
  stripeAvailability: DataAvailability;
  mercuryAvailability: DataAvailability;
}

export const metadata: Metadata = {
  title: 'Admin dashboard',
};

export const runtime = 'nodejs';

async function getAdminOverviewMetrics(): Promise<AdminOverviewMetrics> {
  const defaultUnavailableMetrics: AdminOverviewMetrics = {
    mrrUsd: 0,
    mrrGrowth30dUsd: 0,
    activeSubscribers: 0,
    balanceUsd: 0,
    burnRateUsd: 0,
    runwayMonths: null,
    defaultStatus: 'dead',
    defaultStatusDetail: 'Unable to compute default status.',
    waitlistCount: 0,
    stripeAvailability: { isConfigured: false, isAvailable: false },
    mercuryAvailability: { isConfigured: false, isAvailable: false },
  };

  try {
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated || !entitlements.isAdmin) {
      return {
        ...defaultUnavailableMetrics,
        defaultStatusDetail:
          'Admin access is required to evaluate default status.',
      };
    }

    const [stripeMetrics, mercuryMetrics, waitlistCount] = await Promise.all([
      getAdminStripeOverviewMetrics(),
      getAdminMercuryMetrics(),
      (async () => {
        try {
          const [row] = await db
            .select({ count: drizzleSql<number>`count(*)::int` })
            .from(waitlistEntries);
          return Number(row?.count ?? 0);
        } catch (error) {
          console.error('Error fetching waitlist count:', error);
          return 0;
        }
      })(),
    ]);

    // Extract availability status
    const stripeAvailability: DataAvailability = {
      isConfigured: stripeMetrics.isConfigured,
      isAvailable: stripeMetrics.isAvailable,
      errorMessage: stripeMetrics.errorMessage,
    };

    const mercuryAvailability: DataAvailability = {
      isConfigured: mercuryMetrics.isConfigured,
      isAvailable: mercuryMetrics.isAvailable,
      errorMessage: mercuryMetrics.errorMessage,
    };

    // Only calculate runway if both data sources are available
    const canCalculateFinancials =
      stripeMetrics.isAvailable && mercuryMetrics.isAvailable;

    let runwayMonths: number | null = null;
    let netBurn = 0;
    let monthsToProfitability: number | null = null;
    let isDefaultAlive = false;
    let defaultStatusDetail = '';

    if (canCalculateFinancials) {
      const monthlyRevenue = stripeMetrics.mrrUsd;
      const monthlyExpense = mercuryMetrics.burnRateUsd;
      netBurn = monthlyExpense - monthlyRevenue;
      runwayMonths = netBurn > 0 ? mercuryMetrics.balanceUsd / netBurn : null;

      const revenueGrowth30d = stripeMetrics.mrrGrowth30dUsd;
      monthsToProfitability =
        netBurn > 0 && revenueGrowth30d > 0 ? netBurn / revenueGrowth30d : null;

      // Default Alive/Dead logic (Paul Graham):
      // - Alive if already profitable (net burn <= 0).
      // - Alive if runway covers the time to profitability at current growth.
      // - Dead if runway ends before profitability.
      isDefaultAlive =
        netBurn <= 0 ||
        (monthsToProfitability != null &&
          runwayMonths != null &&
          monthsToProfitability <= runwayMonths);

      if (netBurn <= 0) {
        defaultStatusDetail =
          'Revenue already exceeds spend at the current run rate.';
      } else if (monthsToProfitability == null) {
        defaultStatusDetail =
          'Revenue growth is not yet outpacing burn at the current trajectory.';
      } else if (runwayMonths == null) {
        defaultStatusDetail =
          'Runway is currently unlimited based on cash flow.';
      } else if (isDefaultAlive) {
        defaultStatusDetail = `Runway covers roughly ${monthsToProfitability.toFixed(
          1
        )} months to profitability.`;
      } else {
        defaultStatusDetail =
          'At the current growth rate, runway ends before profitability.';
      }
    } else {
      // Build a helpful message about what's missing
      const missingServices: string[] = [];
      if (!stripeMetrics.isConfigured) {
        missingServices.push('Stripe (not configured)');
      } else if (!stripeMetrics.isAvailable) {
        missingServices.push('Stripe (unavailable)');
      }
      if (!mercuryMetrics.isConfigured) {
        missingServices.push('Mercury (not configured)');
      } else if (!mercuryMetrics.isAvailable) {
        missingServices.push('Mercury (unavailable)');
      }

      defaultStatusDetail =
        missingServices.length > 0
          ? `Cannot calculate status: ${missingServices.join(', ')}`
          : 'Financial data sources unavailable.';
    }

    return {
      mrrUsd: stripeMetrics.mrrUsd,
      mrrGrowth30dUsd: stripeMetrics.mrrGrowth30dUsd,
      activeSubscribers: stripeMetrics.activeSubscribers,
      balanceUsd: mercuryMetrics.balanceUsd,
      burnRateUsd: mercuryMetrics.burnRateUsd,
      runwayMonths,
      defaultStatus: isDefaultAlive ? 'alive' : 'dead',
      defaultStatusDetail,
      waitlistCount,
      stripeAvailability,
      mercuryAvailability,
    };
  } catch (error) {
    console.error('Error computing admin overview metrics:', error);
    return {
      ...defaultUnavailableMetrics,
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
        mrrGrowth30dUsd={metrics.mrrGrowth30dUsd}
        stripeAvailability={metrics.stripeAvailability}
        mercuryAvailability={metrics.mercuryAvailability}
      />

      <section id='users' className='space-y-4'>
        <KpiCards
          mrrUsd={metrics.mrrUsd}
          balanceUsd={metrics.balanceUsd}
          burnRateUsd={metrics.burnRateUsd}
          runwayMonths={metrics.runwayMonths}
          waitlistCount={metrics.waitlistCount}
          activeSubscribers={metrics.activeSubscribers}
          stripeAvailability={metrics.stripeAvailability}
          mercuryAvailability={metrics.mercuryAvailability}
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

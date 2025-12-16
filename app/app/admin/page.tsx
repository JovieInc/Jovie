import { sql as drizzleSql } from 'drizzle-orm';
import type { Metadata } from 'next';
import { ActivityTable } from '@/components/admin/activity-table';
import { KpiCards } from '@/components/admin/kpi-cards';
import { MetricsChart } from '@/components/admin/metrics-chart';
import { ReliabilityCard } from '@/components/admin/reliability-card';
import {
  getAdminActivityFeed,
  getAdminReliabilitySummary,
  getAdminUsageSeries,
} from '@/lib/admin/overview';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import { db, waitlistEntries } from '@/lib/db';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

interface AdminOverviewMetrics {
  mrrUsd: number;
  waitlistCount: number;
}

export const metadata: Metadata = {
  title: 'Admin dashboard',
};

export const runtime = 'nodejs';

async function getAdminOverviewMetrics(): Promise<AdminOverviewMetrics> {
  try {
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated || !entitlements.isAdmin) {
      return { mrrUsd: 0, waitlistCount: 0 };
    }

    const [stripeMetrics, waitlistCount] = await Promise.all([
      getAdminStripeOverviewMetrics(),
      (async () => {
        const [row] = await db
          .select({ count: drizzleSql<number>`count(*)::int` })
          .from(waitlistEntries);
        return Number(row?.count ?? 0);
      })(),
    ]);

    return { mrrUsd: stripeMetrics.mrrUsd, waitlistCount };
  } catch (error) {
    console.error('Error computing admin overview metrics:', error);
    return { mrrUsd: 0, waitlistCount: 0 };
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

      <section id='users' className='space-y-4'>
        <KpiCards
          mrrUsd={metrics.mrrUsd}
          waitlistCount={metrics.waitlistCount}
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

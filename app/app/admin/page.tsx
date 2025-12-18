import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ActivityTable } from '@/components/admin/activity-table';
import { KpiCards } from '@/components/admin/kpi-cards';
import { MetricsChart } from '@/components/admin/metrics-chart';
import { ReliabilityCard } from '@/components/admin/reliability-card';
import {
  getAdminActivityFeed,
  getAdminReliabilitySummary,
  getAdminUsageSeries,
} from '@/lib/admin/overview';
import { APP_URL } from '@/constants/app';

interface AdminOverviewMetrics {
  mrrUsd: number;
  waitlistCount: number;
}

export const metadata: Metadata = {
  title: 'Admin dashboard',
};

function resolveInternalApiUrl(origin: string, path: string): string {
  try {
    return new URL(path, origin).toString();
  } catch {
    return new URL(path, APP_URL).toString();
  }
}

async function getAdminOverviewMetrics(): Promise<AdminOverviewMetrics> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const proto = h.get('x-forwarded-proto') ?? 'https';
    const cookie = h.get('cookie');

    const origin = host ? `${proto}://${host}` : APP_URL;
    const url = resolveInternalApiUrl(origin, '/api/admin/overview');

    const response = await fetch(url, {
      cache: 'no-store',
      headers: cookie ? { cookie } : undefined,
    });

    if (!response.ok) {
      return { mrrUsd: 0, waitlistCount: 0 };
    }

    const json = (await response.json()) as Partial<AdminOverviewMetrics>;

    return {
      mrrUsd: typeof json.mrrUsd === 'number' ? json.mrrUsd : 0,
      waitlistCount:
        typeof json.waitlistCount === 'number' ? json.waitlistCount : 0,
    };
  } catch {
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

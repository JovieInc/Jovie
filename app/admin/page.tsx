import type { Metadata } from 'next';

import { ActivityTable } from '@/components/admin/activity-table';
import { KpiCards } from '@/components/admin/kpi-cards';
import { MetricsChart } from '@/components/admin/metrics-chart';
import { ReliabilityCard } from '@/components/admin/reliability-card';

export const metadata: Metadata = {
  title: 'Admin dashboard',
};

export default function AdminPage() {
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
          (Public preview — no auth or gating enabled.)
        </p>
      </header>

      <section id='users'>
        <KpiCards />
      </section>

      <section id='usage' className='grid gap-6 lg:grid-cols-3'>
        <div className='lg:col-span-2'>
          <MetricsChart />
        </div>
        <div id='errors' className='h-full'>
          <ReliabilityCard />
        </div>
      </section>

      <section id='activity'>
        <ActivityTable />
      </section>
    </div>
  );
}

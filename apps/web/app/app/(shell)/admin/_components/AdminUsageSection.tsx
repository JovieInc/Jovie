import { MetricsChartClient } from '@/components/admin/MetricsChartClient';
import { ReliabilityCard } from '@/components/admin/ReliabilityCard';
import {
  getAdminReliabilitySummary,
  getAdminUsageSeries,
} from '@/lib/admin/overview';

export async function AdminUsageSection() {
  const [usageSeries, reliabilitySummary] = await Promise.all([
    getAdminUsageSeries(14),
    getAdminReliabilitySummary(),
  ]);

  return (
    <section id='usage' className='grid gap-6 lg:grid-cols-3'>
      <div className='lg:col-span-2'>
        <MetricsChartClient points={usageSeries} />
      </div>
      <div id='errors' className='h-full'>
        <ReliabilityCard summary={reliabilitySummary} />
      </div>
    </section>
  );
}

export function AdminUsageSectionSkeleton() {
  return (
    <section id='usage' className='grid gap-6 lg:grid-cols-3'>
      <div className='lg:col-span-2 h-64 rounded-xl skeleton' />
      <div id='errors' className='h-64 rounded-xl skeleton' />
    </section>
  );
}

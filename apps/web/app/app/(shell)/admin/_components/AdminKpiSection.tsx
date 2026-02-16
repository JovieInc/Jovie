import { DefaultStatusBanner } from '@/components/admin/DefaultStatusBanner';
import { KpiCards } from '@/components/admin/KpiCards';
import { getAdminOverviewMetrics } from '@/lib/admin/overview';

const KPI_SKELETON_KEYS = Array.from({ length: 6 }, (_, i) => `kpi-${i + 1}`);

export async function AdminKpiSection() {
  const metrics = await getAdminOverviewMetrics();

  return (
    <>
      <DefaultStatusBanner
        status={metrics.defaultStatus}
        detail={metrics.defaultStatusDetail}
        runwayMonths={metrics.runwayMonths}
        mrrGrowth30dUsd={metrics.mrrGrowth30dUsd}
        stripeAvailability={metrics.stripeAvailability}
        mercuryAvailability={metrics.mercuryAvailability}
      />

      <section id='users' className='space-y-4' data-testid='admin-kpi-section'>
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
    </>
  );
}

export function AdminKpiSectionSkeleton() {
  return (
    <>
      <div className='h-16 rounded-xl skeleton' />
      <section id='users' className='space-y-4'>
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'>
          {KPI_SKELETON_KEYS.map(key => (
            <div key={key} className='h-24 rounded-xl skeleton' />
          ))}
        </div>
      </section>
    </>
  );
}

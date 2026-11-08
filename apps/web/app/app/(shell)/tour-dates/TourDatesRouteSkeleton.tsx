import { PageShell } from '@/components/organisms/PageShell';
import { DashboardSegmentSkeleton } from '@/components/shell/DashboardSegmentSkeleton';

/**
 * First-boot fallback for /app/tour-dates. Same frame as
 * `TourDatesPageClient`, filled with the tour-shaped segment skeleton the
 * dashboard tour-dates route already uses.
 */
export function TourDatesRouteSkeleton() {
  return (
    <PageShell
      frame='none'
      contentPadding='none'
      surfaceMode='table'
      contentClassName='min-h-0'
      data-testid='tour-dates-route-skeleton'
    >
      <DashboardSegmentSkeleton variant='tour' />
    </PageShell>
  );
}

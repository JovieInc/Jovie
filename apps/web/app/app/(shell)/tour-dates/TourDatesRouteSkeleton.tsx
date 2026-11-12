import { DashboardSegmentSkeleton } from '@/components/shell/DashboardSegmentSkeleton';
import { TourDatesPageFrame } from './TourDatesPageFrame';

/**
 * First-boot fallback for /app/tour-dates: the page's own frame, filled with
 * the tour-shaped segment skeleton the dashboard tour-dates route already uses.
 */
export function TourDatesRouteSkeleton() {
  return (
    <TourDatesPageFrame testId='tour-dates-route-skeleton'>
      <DashboardSegmentSkeleton variant='tour' />
    </TourDatesPageFrame>
  );
}

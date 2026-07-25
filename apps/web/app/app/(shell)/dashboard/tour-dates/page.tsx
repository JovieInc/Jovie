import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

/** Legacy dashboard alias to the canonical tour-date entity surface. */
export default function DashboardTourDatesPage() {
  redirect(APP_ROUTES.TOUR_DATES);
}

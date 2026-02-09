import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

// Redirect from legacy /app/dashboard/overview to /app/dashboard
export default function OverviewRedirect() {
  redirect(APP_ROUTES.DASHBOARD_OVERVIEW);
}

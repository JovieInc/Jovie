import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

// Redirect from legacy /app/dashboard/tipping to /app/dashboard/earnings
export default function TippingRedirect() {
  redirect(APP_ROUTES.DASHBOARD_EARNINGS);
}

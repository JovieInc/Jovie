import { APP_ROUTES } from '@/constants/routes';
import { redirectFromEarningsRoute } from '../../earnings/earnings-route';

export const runtime = 'nodejs';

export default async function EarningsPage() {
  await redirectFromEarningsRoute(APP_ROUTES.DASHBOARD_EARNINGS);
}

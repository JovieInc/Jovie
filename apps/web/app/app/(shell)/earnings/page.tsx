import { APP_ROUTES } from '@/constants/routes';
import { redirectFromEarningsRoute } from './earnings-route';

export const runtime = 'nodejs';

export default async function EarningsPage() {
  return redirectFromEarningsRoute(APP_ROUTES.EARNINGS);
}

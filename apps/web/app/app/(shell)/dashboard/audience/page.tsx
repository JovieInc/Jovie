import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export default function LegacyDashboardAudiencePage() {
  redirect(APP_ROUTES.AUDIENCE);
}

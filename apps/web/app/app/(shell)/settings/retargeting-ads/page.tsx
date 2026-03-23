import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

// Retargeting ads settings now live under Audience & Tracking
export default function RetargetingAdsRedirect() {
  redirect(APP_ROUTES.SETTINGS_AUDIENCE);
}

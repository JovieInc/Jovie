import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

// Referral settings are accessible via /app/referrals
export default function SettingsReferralRedirect() {
  redirect(APP_ROUTES.REFERRALS);
}

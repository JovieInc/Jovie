import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

// Ad pixel settings have been merged into the Audience & Tracking page
export default function SettingsAdPixelsRedirect() {
  redirect(APP_ROUTES.SETTINGS_AUDIENCE);
}

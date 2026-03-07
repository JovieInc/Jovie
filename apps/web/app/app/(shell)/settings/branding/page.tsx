import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

// Branding settings have been merged into the Artist Profile page
export default function SettingsBrandingRedirect() {
  redirect(APP_ROUTES.SETTINGS_ARTIST_PROFILE);
}

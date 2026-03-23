import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

// Legacy redirect: /app/settings/profile → /app/settings/artist-profile
export default function SettingsProfilePage() {
  redirect(APP_ROUTES.SETTINGS_ARTIST_PROFILE);
}

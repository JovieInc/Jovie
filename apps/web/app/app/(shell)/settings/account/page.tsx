import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

// Redirect from legacy /app/settings/account to /app/settings/artist-profile
export default function AccountRedirect() {
  redirect(APP_ROUTES.SETTINGS_ARTIST_PROFILE);
}

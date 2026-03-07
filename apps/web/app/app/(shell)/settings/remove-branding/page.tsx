import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

// Redirect from legacy /app/settings/remove-branding to artist profile (branding is now there)
export default function RemoveBrandingRedirect() {
  redirect(APP_ROUTES.SETTINGS_ARTIST_PROFILE);
}

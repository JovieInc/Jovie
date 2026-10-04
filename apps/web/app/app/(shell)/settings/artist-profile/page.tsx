import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

export default function SettingsArtistProfilePage() {
  redirect(APP_ROUTES.SETTINGS_PROFILE);
}

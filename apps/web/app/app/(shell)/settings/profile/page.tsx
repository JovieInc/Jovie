import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

export default function SettingsProfilePage() {
  redirect(APP_ROUTES.SETTINGS_ARTIST_PROFILE);
}

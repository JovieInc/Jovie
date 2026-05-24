import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

export default function SettingsDeleteAccountPage() {
  redirect(APP_ROUTES.SETTINGS_DATA_PRIVACY);
}

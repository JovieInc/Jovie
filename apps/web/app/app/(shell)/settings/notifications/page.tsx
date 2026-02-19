import { redirect } from 'next/navigation';

import { APP_ROUTES } from '@/constants/routes';

export default function SettingsNotificationsPage() {
  redirect(APP_ROUTES.SETTINGS);
}

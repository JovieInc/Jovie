import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

// Data & Privacy settings now live at /app/settings/data-privacy
export default function SettingsDeleteAccountPage() {
  redirect(APP_ROUTES.SETTINGS_DATA_PRIVACY);
}

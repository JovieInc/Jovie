import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

// Legacy alias preserved for backward compatibility.
export default function SettingsAppearancePage() {
  redirect(APP_ROUTES.SETTINGS_ACCOUNT);
}

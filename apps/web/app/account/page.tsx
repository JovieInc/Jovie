import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

// Account dashboard consolidated into /app/settings/account
export default function AccountPage() {
  redirect(APP_ROUTES.SETTINGS_ACCOUNT);
}

export const metadata = {
  title: 'Account Settings | Jovie',
  description: 'Manage your account preferences and settings',
};

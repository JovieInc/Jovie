import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export default async function SettingsConnectorsPage() {
  redirect(`${APP_ROUTES.PROFILES}?add=service`);
}

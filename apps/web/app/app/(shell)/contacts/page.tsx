import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export default function ContactsPage() {
  redirect(APP_ROUTES.SETTINGS_CONTACTS);
}

import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export default function ContactPage() {
  redirect(APP_ROUTES.CONTACTS);
}

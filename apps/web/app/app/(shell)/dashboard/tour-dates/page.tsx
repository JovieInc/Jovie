import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export default function TourDatesPage() {
  redirect(APP_ROUTES.SETTINGS_TOURING);
}

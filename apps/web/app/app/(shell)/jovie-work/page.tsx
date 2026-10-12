import { permanentRedirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export default function JovieWorkPage() {
  permanentRedirect(`${APP_ROUTES.DASHBOARD}?view=done`);
}

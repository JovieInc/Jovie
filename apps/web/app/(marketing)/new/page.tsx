import { permanentRedirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const revalidate = false;

export default function NewLandingPage() {
  permanentRedirect(APP_ROUTES.HOME);
}

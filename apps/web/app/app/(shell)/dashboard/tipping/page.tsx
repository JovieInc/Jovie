import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export default function TippingRedirect() {
  redirect(`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`);
}

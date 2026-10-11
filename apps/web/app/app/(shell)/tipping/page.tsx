import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export default function TippingAliasPage() {
  redirect(`${APP_ROUTES.SETTINGS_PROFILE}?tab=earn#pay`);
}

import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

export default async function RemoveBrandingPage() {
  redirect(APP_ROUTES.PRICING);
}

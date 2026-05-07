import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

export default async function LibraryPage() {
  redirect(APP_ROUTES.LIBRARY);
}

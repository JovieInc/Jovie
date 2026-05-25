import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

export default async function ReleasesPage() {
  redirect(`${APP_ROUTES.LIBRARY}?view=releases`);
}

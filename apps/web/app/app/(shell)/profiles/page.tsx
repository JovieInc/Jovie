import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

/** Legacy workspace alias retained for bookmarks created before JOV-7161. */
export default async function ProfilesPage() {
  redirect(APP_ROUTES.PRESENCE);
}

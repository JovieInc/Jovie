import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

export default async function ThreadsPage() {
  redirect(APP_ROUTES.CHATS);
}

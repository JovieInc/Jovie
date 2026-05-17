import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

export default function LinksPage() {
  redirect(APP_ROUTES.CHAT_PROFILE_PANEL);
}

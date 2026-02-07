import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const metadata = {
  title: 'Dashboard',
  description: 'Chat with Jovie AI',
};

// Chat-first experience: new sessions start on the chat page
export default function AppRootPage() {
  redirect(APP_ROUTES.CHAT);
}

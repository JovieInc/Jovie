import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Dashboard',
  description: 'Manage your Jovie profile',
};

// eslint-disable-next-line @jovie/no-hardcoded-routes -- Redirect to chat as default home
const CHAT_ROUTE = '/app/chat';

// Chat-first experience: new sessions start on the chat page
export default function AppRootPage() {
  redirect(CHAT_ROUTE);
}

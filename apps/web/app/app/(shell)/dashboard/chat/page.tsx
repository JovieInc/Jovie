import { redirect } from 'next/navigation';

// eslint-disable-next-line @jovie/no-hardcoded-routes -- Legacy dashboard path for redirect
const CHAT_ROUTE = '/app/chat';

// Legacy /app/dashboard/chat path redirects to the new chat page
export default function OldChatPage() {
  redirect(CHAT_ROUTE);
}

import { redirect } from 'next/navigation';

// eslint-disable-next-line @jovie/no-hardcoded-routes -- Legacy dashboard path for redirect
const PROFILE_ROUTE = '/app/dashboard/profile';

// Chat is now integrated into the profile page
export default function ChatPage() {
  redirect(PROFILE_ROUTE);
}

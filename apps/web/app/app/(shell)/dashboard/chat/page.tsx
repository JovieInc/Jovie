import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function OldChatPage() {
  // Redirect to the new chat location
  redirect('/app');
}

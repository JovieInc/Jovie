import { redirect } from 'next/navigation';
import { getCachedAuth } from '@/lib/auth/cached';

export default async function LinksPage() {
  const { userId } = await getCachedAuth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/signin?redirect_url=/app/dashboard/profile');
  }

  redirect('/app/dashboard/profile');
}

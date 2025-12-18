import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function LinksPage() {
  const { userId } = await auth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/signin?redirect_url=/app/dashboard/profile');
  }

  redirect('/app/dashboard/profile');
}

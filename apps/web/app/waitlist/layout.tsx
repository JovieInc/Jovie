import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getWaitlistAccessByEmail } from '@/lib/waitlist/access';

export default async function WaitlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect('/signin?redirect_url=/waitlist');
  }

  const user = await currentUser();
  const emailRaw = user?.emailAddresses?.[0]?.emailAddress ?? null;
  if (!emailRaw) {
    redirect('/signin?redirect_url=/waitlist');
  }

  const access = await getWaitlistAccessByEmail(emailRaw);

  if (access.status === 'invited' && access.inviteToken) {
    redirect(`/claim/${encodeURIComponent(access.inviteToken)}`);
  }

  if (access.status === 'claimed') {
    redirect('/app/dashboard/overview');
  }

  return children;
}

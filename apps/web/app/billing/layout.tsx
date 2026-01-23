import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { publicEnv } from '@/lib/env-public';

export default async function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Ensure user is authenticated
  const { userId } = await auth();
  if (!userId) {
    redirect('/signin');
  }

  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <ClientProviders publishableKey={publishableKey} skipCoreProviders>
      <div className='min-h-screen bg-background text-foreground'>
        <div className='mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'>
          <div className='mx-auto max-w-3xl'>{children}</div>
        </div>
      </div>
    </ClientProviders>
  );
}

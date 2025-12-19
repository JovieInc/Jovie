import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

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

  return (
    <div className='min-h-screen bg-background text-foreground'>
      <div className='mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'>
        <div className='mx-auto max-w-3xl'>{children}</div>
      </div>
    </div>
  );
}

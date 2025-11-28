import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ClerkAppProvider } from '@/components/providers/ClerkAppProvider';

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Ensure user is authenticated
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  return (
    <ClerkAppProvider>
      <div className='min-h-screen bg-gray-50 dark:bg-gray-900'>
        <div className='mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'>
          <div className='mx-auto max-w-4xl'>{children}</div>
        </div>
      </div>
    </ClerkAppProvider>
  );
}

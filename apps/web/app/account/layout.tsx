import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { APP_ROUTES } from '@/constants/routes';
import { resolvePublishableKeyFromHeaders } from '@/lib/auth/staging-clerk-keys';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Ensure user is authenticated
  const { userId } = await auth();
  if (!userId) {
    redirect(APP_ROUTES.SIGNIN);
  }

  const publishableKey = await resolvePublishableKeyFromHeaders();

  return (
    <ClientProviders publishableKey={publishableKey} skipCoreProviders>
      <div className='min-h-screen bg-background text-foreground'>
        <div className='mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'>
          <div className='mx-auto max-w-4xl'>{children}</div>
        </div>
      </div>
    </ClientProviders>
  );
}

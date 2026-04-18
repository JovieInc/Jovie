import { redirect } from 'next/navigation';
import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Ensure user is authenticated
  const { userId } = await getCachedAuth();
  if (!userId) {
    redirect(APP_ROUTES.SIGNIN);
  }

  return (
    <ResolvedClientProviders>
      <div className='min-h-screen bg-background text-foreground'>
        <div className='mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'>
          <div className='mx-auto max-w-4xl'>{children}</div>
        </div>
      </div>
    </ResolvedClientProviders>
  );
}

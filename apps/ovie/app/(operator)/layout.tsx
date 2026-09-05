import { headers } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DashboardShellContent } from '@/app/app/(shell)/DashboardShellContent';
import { AppShellSkeleton } from '@/components/organisms/AppShellSkeleton';
import { getCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const dynamic = 'force-dynamic';

export default async function OperatorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const access = await getCurrentAdminPageAccess();
  if (!access.isAuthenticated || !access.userId)
    redirect('/signin?redirect_url=/hud');
  if (!access.hasAdminRole) forbidden();
  const pathname = (await headers()).get('x-ovie-pathname') ?? '/app/ov/chat';
  return (
    <Suspense fallback={<AppShellSkeleton brandVariant='ov' />}>
      <DashboardShellContent
        userId={access.userId}
        pathname={pathname}
        mode='ov'
      >
        {children}
      </DashboardShellContent>
    </Suspense>
  );
}

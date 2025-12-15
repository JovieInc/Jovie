import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminAuthError, requireAdmin } from '@/lib/admin/require-admin';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AdminAuthError && error.code === 'UNAUTHENTICATED') {
      redirect('/signin?redirect_url=/app/admin');
    }

    notFound();
  }

  return children;
}

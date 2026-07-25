import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'nuqs/server';
import {
  buildAdminPeopleHref,
  searchParamsFromRecord,
} from '@/constants/admin-navigation';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const metadata: Metadata = {
  title: 'Admin users',
};

export const runtime = 'nodejs';

interface AdminUsersRedirectPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export default async function AdminUsersRedirectPage({
  searchParams,
}: Readonly<AdminUsersRedirectPageProps>) {
  await requireCurrentAdminPageAccess();

  const params = searchParamsFromRecord(await searchParams);
  redirect(buildAdminPeopleHref('users', params));
}

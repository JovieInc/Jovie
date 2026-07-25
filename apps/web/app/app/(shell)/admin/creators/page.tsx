import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'nuqs/server';
import {
  buildAdminPeopleHref,
  searchParamsFromRecord,
} from '@/constants/admin-navigation';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const metadata: Metadata = {
  title: 'Admin creators',
};

export const runtime = 'nodejs';

interface AdminCreatorsRedirectPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export default async function AdminCreatorsRedirectPage({
  searchParams,
}: Readonly<AdminCreatorsRedirectPageProps>) {
  await requireCurrentAdminPageAccess();

  const params = searchParamsFromRecord(await searchParams);
  redirect(buildAdminPeopleHref('creators', params));
}

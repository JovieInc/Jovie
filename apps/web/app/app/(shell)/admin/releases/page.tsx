import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'nuqs/server';
import {
  buildAdminPeopleHref,
  searchParamsFromRecord,
} from '@/constants/admin-navigation';

interface AdminReleasesPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  title: 'Admin releases',
};

export const runtime = 'nodejs';

export default async function AdminReleasesPage({
  searchParams,
}: Readonly<AdminReleasesPageProps>) {
  const params = searchParamsFromRecord(await searchParams);
  redirect(buildAdminPeopleHref('releases', params));
}

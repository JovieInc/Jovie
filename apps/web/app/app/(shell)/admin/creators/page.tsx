import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'nuqs/server';
import {
  buildAdminPeopleHref,
  searchParamsFromRecord,
} from '@/constants/admin-navigation';

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
  const params = searchParamsFromRecord(await searchParams);
  redirect(buildAdminPeopleHref('creators', params));
}

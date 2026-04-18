import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { SearchParams } from 'nuqs/server';
import {
  buildAdminPeopleHref,
  searchParamsFromRecord,
} from '@/constants/admin-navigation';

export const metadata: Metadata = {
  title: 'Waitlist | Admin',
};

export const runtime = 'nodejs';

interface AdminWaitlistRedirectPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export default async function AdminWaitlistRedirectPage({
  searchParams,
}: Readonly<AdminWaitlistRedirectPageProps>) {
  const params = searchParamsFromRecord(await searchParams);
  redirect(buildAdminPeopleHref('waitlist', params));
}

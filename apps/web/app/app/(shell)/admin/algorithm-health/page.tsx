import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildAdminPeopleHref } from '@/constants/admin-navigation';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const metadata: Metadata = {
  title: 'Algorithm Health',
};

export const runtime = 'nodejs';

export default async function AlgorithmHealthPage() {
  await requireCurrentAdminPageAccess();

  redirect(buildAdminPeopleHref('creators'));
}

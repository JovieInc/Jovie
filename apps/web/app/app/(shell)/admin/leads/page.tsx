import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';

export const metadata: Metadata = {
  title: 'Leads | Admin',
};

export const runtime = 'nodejs';

export default function AdminLeadsRedirectPage() {
  redirect(buildAdminGrowthHref('leads'));
}

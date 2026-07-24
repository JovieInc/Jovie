import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';

export const metadata: Metadata = {
  title: 'Admin ingest',
};

export const runtime = 'nodejs';

export default function AdminIngestRedirectPage() {
  redirect(buildAdminGrowthHref('ingest'));
}

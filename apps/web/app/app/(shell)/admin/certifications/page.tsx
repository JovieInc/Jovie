import type { Metadata } from 'next';
import { OvieCertificationsWorkspace } from '@/components/features/admin/certifications/OvieCertificationsWorkspace';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Certifications',
  description: 'Founder review table for every certification item.',
  robots: NOINDEX_ROBOTS,
};

/**
 * /app/ov/certifications — founder review surface over the certification
 * kernel. Rows load client-side from GET /api/ovie/certifications so the
 * table refreshes as overnight workers land packets.
 */
export default async function AdminCertificationsPage() {
  await requireCurrentAdminPageAccess();

  return <OvieCertificationsWorkspace />;
}

import type { Metadata } from 'next';
import { OvieCertificationsWorkspace } from '@/components/features/admin/certifications/OvieCertificationsWorkspace';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const metadata: Metadata = { title: 'Certifications | Ovie' };

/** Compatibility entry point into the canonical table and review model. */
export default async function FeatureRegistryPage() {
  await requireCurrentAdminPageAccess();
  return <OvieCertificationsWorkspace initialDomain='feature_registry' />;
}

import type { Metadata } from 'next';
import { MeshWorkspace } from '@/components/features/admin/mesh/MeshWorkspace';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Mesh',
  description: 'Read-only agent mesh roster for Ovie.',
  robots: NOINDEX_ROBOTS,
};

/** /app/ov/mesh: read-only agent mesh roster (JOV-8937). Ovie only. */
export default async function AdminMeshPage() {
  await requireCurrentAdminPageAccess();
  return <MeshWorkspace />;
}

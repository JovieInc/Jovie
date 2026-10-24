import type { Metadata } from 'next';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import PresencePage from '../../presence/page';

export const metadata: Metadata = {
  title: 'Presence | Admin',
};

export const runtime = 'nodejs';

export default async function AdminPresencePage() {
  await requireCurrentAdminPageAccess();
  return PresencePage();
}

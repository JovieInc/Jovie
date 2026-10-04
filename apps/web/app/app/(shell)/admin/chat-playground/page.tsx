import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { DeferredChatUiPlayground } from './DeferredChatUiPlayground';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Chat UI Playground',
  description: 'Internal visual inventory for canonical chat states.',
  robots: NOINDEX_ROBOTS,
};

export default async function AdminChatPlaygroundPage() {
  await requireCurrentAdminPageAccess();

  return (
    <AdminPage title='Chat UI Playground' testId='chat-ui-playground-page'>
      <DeferredChatUiPlayground />
    </AdminPage>
  );
}

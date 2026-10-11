import type { Metadata } from 'next';
import { OvieInbox } from '@/components/features/admin/hud/OvieInbox';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const metadata: Metadata = { title: 'Inbox | Ovie' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function InboxPage({
  searchParams,
}: Readonly<{
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  await requireCurrentAdminPageAccess();
  const { case: requestedCase } = await searchParams;
  // Repeated/empty case parameters must not fall back to a different decision.
  const caseId = Array.isArray(requestedCase) ? '' : requestedCase;

  return (
    <AdminPage title='Inbox' testId='founder-inbox-page'>
      <OvieInbox caseId={caseId} />
    </AdminPage>
  );
}

import type { Metadata } from 'next';
import { OvieInbox } from '@/components/features/admin/hud/OvieInbox';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { getSidebarRouteLabel } from '@/lib/constants/sidebar-route-labels';

export const metadata: Metadata = {
  title: getSidebarRouteLabel(APP_ROUTES.ADMIN_INBOX, 'ov'),
};
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

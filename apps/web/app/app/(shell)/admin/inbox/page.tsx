import type { Metadata } from 'next';
import { OvieInbox } from '@/components/features/admin/hud/OvieInbox';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { ReviewInboxPilotWorkbench } from '@/components/features/admin/review-inbox/ReviewInboxPilotWorkbench';
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
  const params = await searchParams;
  const { case: requestedCase, pilot } = params;
  // Repeated/empty case parameters must not fall back to a different decision.
  const caseId = Array.isArray(requestedCase) ? '' : requestedCase;
  const pilotEnabled = pilot === '1' || pilot === 'review-photo';

  return (
    <AdminPage title='Inbox' testId='founder-inbox-page'>
      {pilotEnabled ? <ReviewInboxPilotWorkbench /> : null}
      <OvieInbox caseId={caseId} />
    </AdminPage>
  );
}

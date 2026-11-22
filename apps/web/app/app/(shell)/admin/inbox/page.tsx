import type { Metadata } from 'next';
import { OvieInbox } from '@/components/features/admin/hud/OvieInbox';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { ReviewInboxPilotWorkbench } from '@/components/features/admin/review-inbox/ReviewInboxPilotWorkbench';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { REVIEW_INBOX_PILOT_TENANT } from '@/lib/ovie/review-inbox/contract';

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
  // The review item's own case id opens its annotation canvas; it is not a
  // Summer card, so the Summer inbox is not rendered for it.
  const reviewItem = caseId === REVIEW_INBOX_PILOT_TENANT;
  const pilotEnabled = reviewItem || pilot === '1' || pilot === 'review-photo';

  return (
    <AdminPage title='Inbox' testId='founder-inbox-page'>
      {pilotEnabled ? <ReviewInboxPilotWorkbench /> : null}
      {reviewItem ? null : <OvieInbox caseId={caseId} />}
    </AdminPage>
  );
}

import type { Metadata } from 'next';
import {
  OvieInbox,
  type OvieInboxView,
} from '@/components/features/admin/inbox/OvieInbox';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { captureError } from '@/lib/error-tracking';
import type { OvieInboxResponse } from '@/lib/ovie/inbox';
import { buildOvieInbox } from '@/lib/ovie/inbox.server';

export const metadata: Metadata = {
  title: 'Inbox | Ovie',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function OvieInboxPage({
  searchParams,
}: Readonly<{
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  await requireCurrentAdminPageAccess();
  const params = await searchParams;
  const view: OvieInboxView = params.view === 'decided' ? 'decided' : 'pending';

  let initialData: OvieInboxResponse | null = null;
  try {
    initialData = await buildOvieInbox();
  } catch (error) {
    await captureError('Ovie inbox page failed to load', error, {
      route: '/app/ov/inbox',
    });
  }

  return (
    <AdminPage title='Inbox' testId='ovie-inbox-page'>
      <OvieInbox view={view} initialData={initialData} />
    </AdminPage>
  );
}

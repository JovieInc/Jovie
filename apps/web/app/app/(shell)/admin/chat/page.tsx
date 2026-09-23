import type { Metadata } from 'next';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { OvChatClient } from './OvChatClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Chat',
  description: 'Operator chat surface on the signed-in artist profile.',
  robots: NOINDEX_ROBOTS,
};

/**
 * /app/ov/chat — operator chat surface (JOV-4810).
 *
 * Admin auth is enforced by `apps/web/app/app/(shell)/admin/layout.tsx`; the
 * page-level guard below is authoritative even when Next renders the
 * surrounding layouts in parallel. Turns are tagged `chatMode: 'ov'` and the
 * /api/chat route re-verifies the admin role per request.
 */
export default async function AdminChatPage() {
  await requireCurrentAdminPageAccess();

  return <OvChatClient />;
}

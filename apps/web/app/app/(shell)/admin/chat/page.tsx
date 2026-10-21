import type { Metadata } from 'next';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { OvChatClient } from './OvChatClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Home',
  description: 'What matters across the company loop, with the composer.',
  robots: NOINDEX_ROBOTS,
};

/**
 * /app/ov/chat — Ovie Home and operator chat (JOV-4810, JOV-5959).
 *
 * Admin auth is enforced by `apps/web/app/app/(shell)/admin/layout.tsx`; the
 * page-level guard below is authoritative even when Next renders the
 * surrounding layouts in parallel. Turns are tagged `chatMode: 'ov'` and the
 * /api/chat route re-verifies the admin role per request. Home data loads on
 * the client from the existing shipping-state and inbox endpoints.
 */
export default async function AdminChatPage() {
  await requireCurrentAdminPageAccess();
  return <OvChatClient />;
}

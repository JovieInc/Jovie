import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { assertOviePrivacyUnlocked } from '@/lib/ovie/privacy-lock/server';
import AdminChatPage from './chat/page';

export { metadata } from './chat/page';

// Next.js route-segment config must be a local literal.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /app/ov is Ovie Home (founder decision 2026-10-20): the living canvas above
 * the shared composer. `/app/ov/chat` renders the same Home for deep links.
 */
export default async function AdminHomePage() {
  await requireCurrentAdminPageAccess();
  // Home is the default Ovie door, so it keeps the opt-in privacy lock the
  // /hud door enforced; Home data APIs enforce it again server-side.
  await assertOviePrivacyUnlocked();
  return AdminChatPage();
}

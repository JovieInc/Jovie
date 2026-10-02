import type { Metadata } from 'next';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { getCachedCurrentUser } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { getOvieMacHudSnapshot } from '@/lib/hud/ovie-mac-hud.server';
import { createOvieHomeBriefing } from '@/lib/ovie/home-briefing';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { TIM_DEFAULT_TIMEZONE } from '@/lib/tim-white';
import { OvChatClient } from './OvChatClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Chat',
  description: 'Current founder signal and operator conversation.',
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

  const currentUser = await getCachedCurrentUser();
  let snapshot: Awaited<ReturnType<typeof getOvieMacHudSnapshot>> | null = null;
  try {
    snapshot = await getOvieMacHudSnapshot();
  } catch (error) {
    await captureError(
      'Ovie home briefing failed to load operating signals',
      error,
      {
        route: 'admin/chat',
      }
    );
  }

  const homeBriefing = createOvieHomeBriefing(snapshot, {
    displayName: currentUser?.firstName || currentUser?.fullName,
    timeZone: TIM_DEFAULT_TIMEZONE,
  });

  return <OvChatClient homeBriefing={homeBriefing} />;
}

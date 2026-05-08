import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const runtime = 'nodejs';
// Cannot be static — branches on searchParams.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Legacy /hud route. Preserves existing TV bookmarks (`/hud?kiosk=TOKEN`)
 * by redirecting them to the dedicated token-TV route, and routes admins
 * to the in-shell Ops surface.
 *
 * Token bookmarks → `/hud-tv?kiosk=TOKEN` (preserves token via redirect).
 * Everything else → `/app/admin/ops` (admin-gated by the admin layout).
 */
export default async function HudLegacyPage({
  searchParams,
}: Readonly<{ readonly searchParams: Promise<SearchParams> }>) {
  const params = await searchParams;
  const rawKiosk = params.kiosk;
  const kioskToken = typeof rawKiosk === 'string' ? rawKiosk : null;

  if (kioskToken) {
    redirect(`${APP_ROUTES.HUD_TV}?kiosk=${encodeURIComponent(kioskToken)}`);
  }

  redirect(APP_ROUTES.ADMIN_OPS);
}

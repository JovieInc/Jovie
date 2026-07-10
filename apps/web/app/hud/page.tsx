import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Legacy compatibility alias for the Ovie/HUD bookmark.
 *
 * Canonical admin rendering lives at /app/admin/ops. Token bookmarks retain
 * their dedicated /hud-tv wrapper so this route never owns metrics or layout.
 */
export default async function HudPage({
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

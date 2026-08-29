import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Legacy TV URL. Preserve token-authenticated kiosk mode; ordinary fullscreen
 * returns to the canonical in-shell Ops route.
 */
export default async function HudTvRedirectPage({
  searchParams,
}: Readonly<{ readonly searchParams: Promise<SearchParams> }>) {
  const params = await searchParams;
  const kiosk = typeof params.kiosk === 'string' ? params.kiosk : null;
  if (kiosk) {
    redirect(`${APP_ROUTES.HUD}?kiosk=${encodeURIComponent(kiosk)}`);
  }
  redirect(`${APP_ROUTES.ADMIN_OPS}?fs=1`);
}

import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Legacy Ops URL. Ovie is one HUD at /hud.
 */
export default async function AdminOpsRedirectPage({
  searchParams,
}: Readonly<{ readonly searchParams: Promise<SearchParams> }>) {
  const params = await searchParams;
  const mode = typeof params.mode === 'string' ? params.mode : null;
  if (mode === 'kiosk') {
    redirect(`${APP_ROUTES.HUD}?fs=1`);
  }
  redirect(APP_ROUTES.HUD);
}

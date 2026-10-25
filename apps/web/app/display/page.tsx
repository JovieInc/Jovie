import { cookies } from 'next/headers';
import { DisplayNotAuthorized } from '@/components/features/admin/hud/DisplayNotAuthorized';
import { DisplayRetry } from '@/components/features/admin/hud/DisplayRetry';
import { OvieDisplayHome } from '@/components/features/admin/hud/OvieDisplayHome';
import { displayAccess } from '@/lib/ovie/display/server';
import { DISPLAY_COOKIE } from '@/lib/ovie/display/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The office display: Ovie Home, Full Screen, read only, no login. Renders no
 * company data unless a valid, unrevoked display session cookie is present. A
 * store outage reads "reconnecting" and retries with backoff, so the wall
 * recovers on its own instead of waiting for the 6 hour reconnect.
 */
export default async function DisplayPage() {
  const token = (await cookies()).get(DISPLAY_COOKIE)?.value;
  const access = await displayAccess(token);
  if (access === 'ok') return <OvieDisplayHome />;
  if (access === 'unavailable') return <DisplayRetry />;
  return <DisplayNotAuthorized />;
}

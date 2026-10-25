import { cookies } from 'next/headers';
import { OvieDisplayHome } from '@/components/features/admin/hud/OvieDisplayHome';
import { isDisplayCookieValid } from '@/lib/ovie/display/server';
import { DISPLAY_COOKIE } from '@/lib/ovie/display/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The office display: Ovie Home, Full Screen, read only, no login. Renders no
 * company data unless a valid display session cookie is present.
 */
export default async function DisplayPage() {
  const token = (await cookies()).get(DISPLAY_COOKIE)?.value;
  if (!isDisplayCookieValid(token))
    return (
      <main className='flex min-h-screen items-center justify-center bg-base text-secondary-token'>
        This display is not authorized.
      </main>
    );
  return <OvieDisplayHome />;
}

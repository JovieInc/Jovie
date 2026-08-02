import { redirect } from 'next/navigation';
import type { SearchParams } from 'nuqs/server';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

/**
 * Audience is a Contacts workspace view. Keep historic links useful while
 * preserving every supported audience filter in the destination URL.
 */
export function buildAudienceContactsRedirectPath(
  searchParams: SearchParams
): string {
  const params = new URLSearchParams([['tab', 'audience']]);

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'tab' || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      params.append(key, entry);
    }
  }

  return `${APP_ROUTES.CONTACTS}?${params.toString()}`;
}

export default async function AudiencePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<SearchParams>;
}>) {
  redirect(buildAudienceContactsRedirectPath(await searchParams));
}

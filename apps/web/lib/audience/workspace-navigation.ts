import { APP_ROUTES } from '@/constants/routes';

export type AudienceWorkspaceDestination = 'contacts' | 'audience' | 'insights';

/**
 * Audience href that keeps the current query and forces the audience tab.
 * `/app/contacts?q=berlin&page=2` becomes
 * `/app/contacts?q=berlin&page=2&tab=audience`.
 */
export function buildAudienceWorkspaceHref(searchParams: {
  entries(): IterableIterator<[string, string]>;
}): string {
  const params = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    if (key === 'tab' || value === undefined) continue;
    params.append(key, value);
  }
  params.set('tab', 'audience');
  return `${APP_ROUTES.CONTACTS}?${params.toString()}`;
}

/**
 * Contextual destinations owned by the Audience root. Callers may preserve
 * active audience filters by supplying a route-specific Audience href.
 */
export function getAudienceWorkspaceNavigation(
  audienceHref: string = APP_ROUTES.CONTACTS_AUDIENCE
) {
  return [
    {
      value: 'contacts',
      label: 'Contacts',
      href: APP_ROUTES.CONTACTS,
    },
    {
      value: 'audience',
      label: 'Audience',
      href: audienceHref,
    },
    {
      value: 'insights',
      label: 'Insights',
      href: APP_ROUTES.INSIGHTS,
    },
  ] as const satisfies readonly {
    value: AudienceWorkspaceDestination;
    label: string;
    href: string;
  }[];
}

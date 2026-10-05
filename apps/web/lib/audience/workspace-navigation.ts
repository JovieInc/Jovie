import { APP_ROUTES } from '@/constants/routes';

export type AudienceWorkspaceDestination = 'contacts' | 'audience' | 'insights';

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

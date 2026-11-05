import { APP_ROUTES } from '@/constants/routes';

/**
 * The /product hub's index of pages the 16-link footer record leaves out, so
 * each stays one click away and is not an SEO orphan (`geo-orphan`).
 */
export interface ProductExploreLink {
  readonly href: string;
  readonly label: string;
}

export interface ProductExploreGroup {
  readonly id: string;
  readonly title: string;
  readonly links: readonly ProductExploreLink[];
}

export const PRODUCT_EXPLORE_GROUPS: readonly ProductExploreGroup[] = [
  {
    id: 'features',
    title: 'Features',
    links: [
      { href: APP_ROUTES.PRODUCT_LINK_ANALYTICS, label: 'Link analytics' },
      { href: APP_ROUTES.PRODUCT_PRE_SAVE, label: 'Pre-save' },
      {
        href: APP_ROUTES.PRODUCT_RELEASE_SCHEDULING,
        label: 'Release scheduling',
      },
      { href: APP_ROUTES.PRODUCT_DSP_LINKS, label: 'Streaming links' },
      { href: APP_ROUTES.PRODUCT_UTM_LINKS, label: 'Campaign links' },
      { href: APP_ROUTES.PRODUCT_ISRC, label: 'ISRC codes' },
      { href: APP_ROUTES.PRODUCT_COMMAND_PALETTE, label: 'Command palette' },
    ],
  },
  {
    id: 'more',
    title: 'More',
    links: [
      { href: APP_ROUTES.SOLUTIONS_ARTISTS, label: 'Solutions' },
      { href: APP_ROUTES.LAUNCH, label: 'Release system' },
      { href: APP_ROUTES.COMPARE, label: 'Compare Jovie' },
      { href: APP_ROUTES.ALTERNATIVES, label: 'Alternatives' },
      { href: APP_ROUTES.ENGINEERING, label: 'Engineering' },
    ],
  },
];

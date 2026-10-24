import { APP_ROUTES } from '@/constants/routes';

/**
 * Public copy for /product/command-palette.
 * Cmd+K filters the workspace command registry.
 * An empty query shows five items in each group.
 */
export const COMMAND_PALETTE_COPY = {
  seo: {
    title: 'Command palette',
    description:
      'Cmd+K opens a search field over the workspace. Type to filter routes and skills. Arrow keys move the highlight. Enter selects the highlighted command. An empty query shows five items in each group.',
  },
  headline: 'Command palette',
  support:
    'Cmd+K opens a search field over the workspace. Type to filter routes and skills. Arrow keys move the highlight. Enter selects the highlighted command. An empty query shows five items in each group.',
  links: [
    { href: APP_ROUTES.PRODUCT, label: 'Product' },
    { href: APP_ROUTES.SMART_LINKS, label: 'Smart Links' },
    { href: APP_ROUTES.PRICING, label: 'Pricing' },
    { href: APP_ROUTES.CARD, label: 'Jovie Card' },
  ],
} as const;

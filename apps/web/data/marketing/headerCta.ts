import { APP_ROUTES } from '@/constants/routes';

/**
 * Homepage header CTA. A plain data module so the server-rendered (home)
 * layout and the client MarketingHeader share one value without crossing the
 * 'use client' boundary. Every door routes into `/start` (the chat
 * onboarding), the same destination as the hero action.
 */
export const HOME_MARKETING_HEADER_CTA = {
  label: 'Claim your handle',
  href: APP_ROUTES.START,
} as const;

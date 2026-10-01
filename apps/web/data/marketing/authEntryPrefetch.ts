import { APP_ROUTES } from '@/constants/routes';

/** Dynamic auth, chat and waitlist handoffs wait for visitor intent. */
export function resolveMarketingAuthPrefetch(
  href: string,
  requested?: boolean
): boolean | undefined {
  if (requested !== undefined) return requested;
  const path = href.split(/[?#]/, 1)[0];
  return [
    APP_ROUTES.SIGNUP,
    APP_ROUTES.SIGNIN,
    APP_ROUTES.START,
    APP_ROUTES.CHAT,
    APP_ROUTES.WAITLIST,
  ].some(authPath => authPath === path)
    ? false
    : undefined;
}

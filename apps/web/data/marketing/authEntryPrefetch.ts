import { APP_ROUTES } from '@/constants/routes';

/** Dynamic auth entry starts on visitor intent, not static marketing prefetch. */
export function resolveMarketingAuthPrefetch(
  href: string,
  requested?: boolean
): boolean | undefined {
  if (requested !== undefined) return requested;
  const path = href.split(/[?#]/, 1)[0];
  return [APP_ROUTES.SIGNUP, APP_ROUTES.SIGNIN, APP_ROUTES.START].some(
    authPath => authPath === path
  )
    ? false
    : undefined;
}

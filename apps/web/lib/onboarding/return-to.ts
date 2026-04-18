import { APP_ROUTES } from '@/constants/routes';

export const DEFAULT_ONBOARDING_RETURN_TO = `${APP_ROUTES.CHAT}?from=onboarding&panel=profile`;

const ALLOWED_ONBOARDING_RESUME_TARGETS = new Set([
  'spotify',
  'dsp',
  'social',
  'releases',
  'profile-ready',
]);

/**
 * Allowed post-checkout destinations (pathname → required query params).
 * Chat with from=onboarding triggers the welcome chat bootstrap.
 */
const ALLOWED_POST_CHECKOUT_ROUTES: ReadonlyArray<{
  pathname: string;
  requiredParams?: Record<string, string>;
}> = [{ pathname: APP_ROUTES.CHAT, requiredParams: { from: 'onboarding' } }];

function matchPostCheckoutRoute(parsed: URL): string | null {
  for (const route of ALLOWED_POST_CHECKOUT_ROUTES) {
    if (parsed.pathname !== route.pathname) continue;
    if (route.requiredParams) {
      const allMatch = Object.entries(route.requiredParams).every(
        ([key, value]) => parsed.searchParams.get(key) === value
      );
      if (!allMatch) continue;
    }
    // Rebuild from allowlist to prevent injection
    const url = new URL(route.pathname, 'https://jovie.invalid');
    if (route.requiredParams) {
      for (const [key, value] of Object.entries(route.requiredParams)) {
        url.searchParams.set(key, value);
      }
    }
    // Preserve allowed extra params (panel)
    const panel = parsed.searchParams.get('panel');
    if (panel) url.searchParams.set('panel', panel);
    return `${url.pathname}?${url.searchParams.toString()}`;
  }
  return null;
}

export function normalizeOnboardingReturnTo(raw: unknown): string {
  if (typeof raw !== 'string') {
    return DEFAULT_ONBOARDING_RETURN_TO;
  }

  const trimmed = raw.trim();

  // Allow onboarding resume URLs
  if (trimmed.startsWith(APP_ROUTES.ONBOARDING)) {
    const parsed = new URL(trimmed, 'https://jovie.invalid');
    if (parsed.pathname !== APP_ROUTES.ONBOARDING) {
      return DEFAULT_ONBOARDING_RETURN_TO;
    }

    const resume = parsed.searchParams.get('resume');
    if (!resume || !ALLOWED_ONBOARDING_RESUME_TARGETS.has(resume)) {
      return DEFAULT_ONBOARDING_RETURN_TO;
    }

    return `${APP_ROUTES.ONBOARDING}?resume=${resume}`;
  }

  // Allow post-checkout destinations (e.g. /app/chat?from=onboarding)
  const parsed = new URL(trimmed, 'https://jovie.invalid');
  return matchPostCheckoutRoute(parsed) ?? DEFAULT_ONBOARDING_RETURN_TO;
}

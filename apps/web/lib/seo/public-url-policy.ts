import { APP_ROUTES } from '@/constants/routes';

/**
 * Public URL decisions for GSC recovery.
 *
 * Keep this table exact-path and small. Do not invent marketing pages here.
 * /product stays gone until Design Ready ships a real route.
 * /you stays a claimable hold — never reserve it as a system handle.
 */

export type PublicUrlOwner = 'web' | 'summer';

export type PublicUrlPolicyEntry =
  | {
      readonly path: string;
      readonly action: 'redirect';
      readonly destination: string;
      readonly status: 301 | 308;
      readonly owner: PublicUrlOwner;
      readonly note: string;
    }
  | {
      readonly path: string;
      readonly action: 'gone';
      readonly status: 410;
      readonly owner: PublicUrlOwner;
      readonly note: string;
    }
  | {
      readonly path: string;
      readonly action: 'hold';
      readonly owner: PublicUrlOwner;
      readonly note: string;
    };

export const PUBLIC_URL_POLICY = [
  {
    path: '/privacy',
    action: 'redirect',
    destination: APP_ROUTES.LEGAL_PRIVACY,
    status: 308,
    owner: 'web',
    note: 'Legacy legal alias. Keep the permanent hop; sitemap lists /legal/privacy.',
  },
  {
    path: '/terms',
    action: 'redirect',
    destination: APP_ROUTES.LEGAL_TERMS,
    status: 308,
    owner: 'web',
    note: 'Legacy legal alias. Keep the permanent hop; sitemap lists /legal/terms.',
  },
  {
    path: '/cookies',
    action: 'redirect',
    destination: APP_ROUTES.LEGAL_COOKIES,
    status: 308,
    owner: 'web',
    note: 'Legacy legal alias. Keep the permanent hop; sitemap lists /legal/cookies.',
  },
  {
    path: '/sign-up',
    action: 'redirect',
    destination: APP_ROUTES.SIGNUP,
    status: 308,
    owner: 'web',
    note: 'Hyphenated auth alias.',
  },
  {
    path: '/sign-in',
    action: 'redirect',
    destination: APP_ROUTES.SIGNIN,
    status: 308,
    owner: 'web',
    note: 'Hyphenated auth alias.',
  },
  {
    path: '/login',
    action: 'redirect',
    destination: APP_ROUTES.SIGNIN,
    status: 308,
    owner: 'web',
    note: 'Proxy-owned legacy auth alias (JOV-3054).',
  },
  {
    path: '/request-access',
    action: 'redirect',
    destination: APP_ROUTES.START,
    status: 308,
    owner: 'web',
    note: 'Proxy-owned legacy onboarding alias (JOV-3054).',
  },
  {
    path: '/tips',
    action: 'redirect',
    destination: APP_ROUTES.PAY,
    status: 308,
    owner: 'web',
    note: 'Retired tipping landing page.',
  },
  {
    path: '/product',
    action: 'gone',
    status: 410,
    owner: 'web',
    note: 'Pen has /product; Next treated it as a username. Do not invent the page.',
  },
  {
    path: '/music',
    action: 'gone',
    status: 410,
    owner: 'web',
    note: 'Root /music is not a marketing route. Profile mode lives at /{username}/music.',
  },
  {
    path: '/shows',
    action: 'gone',
    status: 410,
    owner: 'web',
    note: 'No marketing /shows route. Root path was a username 404.',
  },
  {
    path: '/you',
    action: 'hold',
    owner: 'summer',
    note: 'Locked claim-card target for /product hero proof. Keep 404 until the profile is seeded. Do not reserve the handle.',
  },
] as const satisfies readonly PublicUrlPolicyEntry[];

export function normalizePublicPolicyPath(pathname: string): string {
  const normalized = pathname.split(/[?#]/u)[0]?.replace(/\/+$/u, '') ?? '';
  return (normalized === '' ? '/' : normalized).toLowerCase();
}

export function getPublicUrlPolicyEntry(
  pathname: string
): (typeof PUBLIC_URL_POLICY)[number] | undefined {
  const path = normalizePublicPolicyPath(pathname);
  return PUBLIC_URL_POLICY.find(entry => entry.path === path);
}

export function resolvePublicUrlGone(pathname: string): boolean {
  return getPublicUrlPolicyEntry(pathname)?.action === 'gone';
}

export function getSitemapExcludedPublicPaths(): readonly string[] {
  return PUBLIC_URL_POLICY.filter(
    entry => entry.action === 'redirect' || entry.action === 'gone'
  ).map(entry => entry.path);
}

export function getGoneReservedHandles(): readonly string[] {
  return PUBLIC_URL_POLICY.filter(entry => entry.action === 'gone').map(entry =>
    entry.path.slice(1)
  );
}

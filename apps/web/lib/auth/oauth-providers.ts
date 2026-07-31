/**
 * OAuth provider availability guard.
 *
 * Source of truth for which social/OAuth providers may render in the auth UI.
 * Providers default to disabled and only appear when listed in the hardcoded
 * allowlist below. This is intentional and permanent (JOV-2131 / JOV-2062):
 *
 * 1. Fail-closed auth UI. An env-var kill-switch that silently evaluates to
 *    false empties the entire sign-in surface for every user.
 * 2. Provider enablement is a product + credentials decision (Clerk/Better Auth
 *    dashboard config, Google/Apple console redirect URIs). Code review is the
 *    correct control plane — not a Vercel dashboard toggle.
 * 3. We already tried `NEXT_PUBLIC_CLERK_OAUTH_<PROVIDER>_ENABLED=1` gating
 *    (PR #8458 dynamic bracket access, then PR #8497 static process.env
 *    lookups). Production kept every provider hidden even when the vars were
 *    present in Vercel. Investigation (JOV-2131) showed turbo correctly hashes
 *    `NEXT_PUBLIC_*` and Next correctly collects them when set at build time —
 *    the env-gate pattern itself is the wrong chokepoint for this surface.
 *
 * To remove a provider: delete its allowlist case and the corresponding
 * dashboard config. To add one: add a case only after end-to-end credential
 * verification (redirect URIs, client secrets, production smoke).
 *
 * See JOV-2062, JOV-2131, docs/auth/next-public-oauth-flags.md.
 */

export type ClerkOAuthProvider =
  | 'apple'
  | 'google'
  | 'facebook'
  | 'github'
  | 'spotify'
  | 'tiktok';

export type PrimaryAuthOAuthProvider = Extract<
  ClerkOAuthProvider,
  'apple' | 'google'
>;

export const AUTH_OAUTH_PROVIDER_ORDER = [
  'apple',
  'google',
] as const satisfies readonly PrimaryAuthOAuthProvider[];

export const AUTH_OAUTH_PROVIDER_LABELS = {
  apple: 'Continue with Apple',
  google: 'Continue with Google',
} as const satisfies Record<PrimaryAuthOAuthProvider, string>;

export const CLERK_SOCIAL_BUTTON_LABEL_TEMPLATE =
  'Continue with {{provider|titleize}}' as const;

export function getAuthOAuthProviderLabel(
  provider: PrimaryAuthOAuthProvider
): string {
  return AUTH_OAUTH_PROVIDER_LABELS[provider];
}

export function getEnabledAuthOAuthProviders(): readonly PrimaryAuthOAuthProvider[] {
  return AUTH_OAUTH_PROVIDER_ORDER.filter(isOAuthProviderEnabled);
}

/**
 * Per-provider enablement check.
 *
 * Hardcoded allowlist — do not reintroduce `process.env.NEXT_PUBLIC_*` reads
 * here. Env-based gates for this surface already failed in production twice
 * (dynamic access never inlines; static access still left sign-in empty when
 * build-time truth diverged from dashboard state). See JOV-2131.
 */
export function isOAuthProviderEnabled(provider: ClerkOAuthProvider): boolean {
  switch (provider) {
    case 'apple':
    case 'google':
      return true;
    case 'facebook':
    case 'github':
    case 'spotify':
    case 'tiktok':
      return false;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/**
 * Build the Clerk `appearance.elements` config that hides any disabled
 * OAuth provider button. Clerk renders one button per configured provider;
 * the element key is `socialButtonsBlockButton__<provider>` (or
 * `socialButtonsIconButton__<provider>` for the icon-only variant).
 *
 * Even if a provider is mistakenly left enabled in the Clerk dashboard, this
 * hides its button at the rendering layer — so this helper is the final gate.
 */
export function buildDisabledOAuthProviderElements(): Record<string, string> {
  const allProviders: readonly ClerkOAuthProvider[] = [
    'apple',
    'google',
    'facebook',
    'github',
    'spotify',
    'tiktok',
  ];

  const elements: Record<string, string> = {};
  for (const provider of allProviders) {
    if (isOAuthProviderEnabled(provider)) continue;
    // Hide both variants Clerk may render.
    elements[`socialButtonsBlockButton__${provider}`] = 'hidden';
    elements[`socialButtonsIconButton__${provider}`] = 'hidden';
  }
  return elements;
}

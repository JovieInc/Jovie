/**
 * OAuth provider availability guard.
 *
 * Source of truth for which social/OAuth providers are allowed to render in
 * the Clerk auth UI. Providers default to disabled — they only appear when an
 * explicit `NEXT_PUBLIC_CLERK_OAUTH_<PROVIDER>_ENABLED=1` flag is set AND we
 * have evidence credentials are valid (e.g. Clerk dashboard configured).
 *
 * Why: Apple OAuth has been shipping broken in production ("invalid client")
 * because nothing stopped the provider button from rendering when credentials
 * were missing. This guard is the single chokepoint — both the AuthShell page
 * and the AuthModal use it, so a provider cannot silently re-appear.
 *
 * See JOV-2062.
 */

export type ClerkOAuthProvider =
  | 'apple'
  | 'google'
  | 'facebook'
  | 'github'
  | 'spotify'
  | 'tiktok';

/**
 * Per-provider enablement check.
 *
 * Reads `NEXT_PUBLIC_CLERK_OAUTH_<PROVIDER>_ENABLED` (must be the literal `'1'`).
 * Anything else — undefined, empty string, `'0'`, `'true'` — keeps the provider
 * off. This is intentional: we fail closed, not open.
 *
 * The flag is `NEXT_PUBLIC_` so it can be read in both server components and
 * client components without an extra round-trip.
 *
 * IMPORTANT: each provider must use a *statically-referenced* `process.env.X`
 * expression. Next.js / webpack DefinePlugin only inlines `NEXT_PUBLIC_*` env
 * vars when the key is referenced as a literal property access. Dynamic
 * `process.env[envKey]` lookups always resolve to `undefined` in client
 * bundles because `process.env` is replaced at build time, not at runtime.
 */
export function isOAuthProviderEnabled(provider: ClerkOAuthProvider): boolean {
  switch (provider) {
    case 'apple':
      return process.env.NEXT_PUBLIC_CLERK_OAUTH_APPLE_ENABLED === '1';
    case 'google':
      return process.env.NEXT_PUBLIC_CLERK_OAUTH_GOOGLE_ENABLED === '1';
    case 'facebook':
      return process.env.NEXT_PUBLIC_CLERK_OAUTH_FACEBOOK_ENABLED === '1';
    case 'github':
      return process.env.NEXT_PUBLIC_CLERK_OAUTH_GITHUB_ENABLED === '1';
    case 'spotify':
      return process.env.NEXT_PUBLIC_CLERK_OAUTH_SPOTIFY_ENABLED === '1';
    case 'tiktok':
      return process.env.NEXT_PUBLIC_CLERK_OAUTH_TIKTOK_ENABLED === '1';
    default: {
      const _exhaustive: never = provider;
      void _exhaustive;
      return false;
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
 * hides its button at the rendering layer — so the env flag is the final gate.
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

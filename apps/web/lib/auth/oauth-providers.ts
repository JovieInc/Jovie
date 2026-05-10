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
 */
export function isOAuthProviderEnabled(provider: ClerkOAuthProvider): boolean {
  const envKey = `NEXT_PUBLIC_CLERK_OAUTH_${provider.toUpperCase()}_ENABLED`;
  // Bracket access — NEXT_PUBLIC_ vars get DefinePlugin-inlined only for the
  // exact keys statically referenced. Reading via bracket here means missing
  // vars correctly become undefined at runtime.
  const value = (process.env as Record<string, string | undefined>)[envKey];
  return value === '1';
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

/**
 * Canonical Clerk component options shared across all auth flows.
 *
 * `oidcPrompt: 'select_account'` forces the OAuth provider (Google, Apple) to
 * present the account chooser on every auth attempt — preventing silent
 * account switching when the user wants to use a different account.
 *
 * Spread this object into both `<SignIn>` and `<SignUp>` components so the
 * behaviour is consistent across all entry points.
 *
 * Audit finding: JOV-2394 #85
 */
export const CLERK_COMPONENT_OPTIONS = {
  oidcPrompt: 'select_account',
} as const satisfies { oidcPrompt: string };

/**
 * Shared authentication constants
 * Used across signin, signup, waitlist, and onboarding flows
 */

/**
 * Session storage keys for auth-related data
 */
export const AUTH_STORAGE_KEYS = {
  /** Key for storing redirect URL after authentication */
  REDIRECT_URL: 'jovie.auth_redirect_url',
  /** Key for storing last used authentication method */
  LAST_METHOD: 'jovie.last_auth_method',
} as const;

/**
 * Shared form layout classes for auth, onboarding, and waitlist screens.
 * These ensure consistent spacing and typography across all flows.
 */
export const FORM_LAYOUT = {
  /** Title styling - consistent across all auth/onboarding/waitlist screens */
  title:
    'text-[22px] font-[510] text-[var(--linear-text-primary)] text-center tracking-[-0.019em] leading-[1.2] [font-feature-settings:"cv01","ss03","rlig"_1,"calt"_1]',
  /** Hint/prompt text below titles */
  hint: 'text-[15px] font-[400] text-[var(--linear-text-secondary)] text-center tracking-[-0.011em] leading-[1.5] mt-2',
  /** Container for title + optional hint with consistent spacing */
  headerSection: 'flex flex-col items-center justify-center mb-8',
  /** Main form container with spacing between header and form elements */
  formContainer: 'w-full flex flex-col',
  /** Spacing within form (between input groups, buttons) */
  formInner: 'space-y-3 w-full',
  /** Footer hint text below the main CTA button - prevents layout shift */
  footerHint:
    'min-h-[40px] w-full max-w-full flex flex-wrap items-center justify-center gap-1 text-[13px] font-[450] text-[var(--linear-text-tertiary)] text-center px-2 mt-6',
  /** Reserved space for error messages to prevent layout shift */
  errorContainer: 'h-[24px] flex items-center justify-center overflow-hidden',
} as const;

/**
 * Shared CSS classes for auth components
 */
export const AUTH_CLASSES = {
  /** Error message styling with fade-in animation */
  fieldError:
    'text-[13px] font-[450] text-destructive text-center animate-in fade-in-0 slide-in-from-top-1 duration-200',
  /** Step transition animation for multi-step forms */
  stepTransition:
    'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out',
  /** OAuth button touch optimization for mobile */
  oauthButtonMobile:
    'touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-[0.98] transition-transform duration-150',
} as const;

/**
 * Validates and sanitizes a redirect URL.
 * - Must start with "/" (relative path)
 * - Must not start with "//" (protocol-relative URL)
 * - Strips hash fragments to prevent malformed redirects (e.g., /signin#/reset-password)
 *
 * @param url - The URL to sanitize
 * @returns The sanitized URL, or null if invalid
 */
export function sanitizeRedirectUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  if (!url.startsWith('/') || url.startsWith('//')) return null;

  // Strip hash fragment to prevent malformed URLs like /signin#/reset-password
  const hashIndex = url.indexOf('#');
  const cleanUrl = hashIndex >= 0 ? url.slice(0, hashIndex) : url;

  // Ensure something meaningful remains after stripping
  return cleanUrl && cleanUrl !== '/' ? cleanUrl : null;
}

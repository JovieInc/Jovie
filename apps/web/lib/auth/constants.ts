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
  title: 'text-lg font-medium text-[#1f2023] dark:text-[#e3e4e6] text-center',
  /** Hint/prompt text below titles */
  hint: 'text-sm text-[#6b6f76] dark:text-[#969799] text-center',
  /** Container for title + optional hint with consistent spacing */
  headerSection: 'space-y-2',
  /** Main form container with spacing between header and form elements */
  formContainer: 'space-y-6',
  /** Spacing within form (between input groups, buttons) */
  formInner: 'space-y-4',
  /** Footer hint text below the main CTA button - prevents layout shift */
  footerHint:
    'min-h-[40px] w-full max-w-full flex flex-wrap items-center justify-center gap-1 text-[13px] font-[450] text-[#6b6f76] dark:text-[#969799] text-center px-2',
  /** Reserved space for error messages to prevent layout shift */
  errorContainer: 'min-h-[24px] flex items-center justify-center',
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
    'touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:opacity-90 transition-opacity duration-150',
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

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
 * Shared CSS classes for auth components
 */
export const AUTH_CLASSES = {
  /** Error message styling with fade-in animation */
  fieldError:
    'mt-3 text-[13px] font-[450] text-destructive text-center animate-in fade-in-0 slide-in-from-top-1 duration-200',
  /** Step transition animation for multi-step forms */
  stepTransition:
    'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out',
  /** OAuth button touch optimization for mobile */
  oauthButtonMobile:
    'touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-[0.98] transition-transform duration-150',
} as const;

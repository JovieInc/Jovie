/**
 * Tracking Consent Utilities
 *
 * Handles consent state management for pixel tracking.
 * Respects Global Privacy Control (GPC) and Do Not Track (DNT) signals.
 */

export type ConsentState = 'undecided' | 'accepted' | 'rejected' | 'gpc-opted-out';

const CONSENT_COOKIE_NAME = 'jv_tracking_consent';
const CONSENT_STORAGE_KEY = 'jovie_tracking_consent';

/**
 * Check if Global Privacy Control is enabled
 * GPC is a browser-level opt-out signal
 */
export function isGPCEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  // @ts-expect-error - GPC is not in the TypeScript Navigator type yet
  return navigator.globalPrivacyControl === true;
}

/**
 * Check if Do Not Track is enabled
 * DNT is older but still respected as a signal
 */
export function isDNTEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.doNotTrack === '1';
}

/**
 * Get current consent state from storage
 */
export function getConsentState(): ConsentState {
  if (typeof window === 'undefined') return 'undecided';

  // GPC takes precedence
  if (isGPCEnabled()) return 'gpc-opted-out';

  // Check localStorage first (more reliable)
  const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
  if (stored === 'accepted' || stored === 'rejected') {
    return stored;
  }

  // Fall back to cookie
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === CONSENT_COOKIE_NAME) {
      if (value === 'accepted' || value === 'rejected') {
        return value;
      }
    }
  }

  return 'undecided';
}

/**
 * Set consent state in storage and cookie
 */
export function setConsentState(state: 'accepted' | 'rejected'): void {
  if (typeof window === 'undefined') return;

  // Store in localStorage
  localStorage.setItem(CONSENT_STORAGE_KEY, state);

  // Also set as cookie for server-side access
  // 1 year expiry
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${CONSENT_COOKIE_NAME}=${state}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
}

/**
 * Check if tracking is allowed based on current consent state
 */
export function isTrackingAllowed(): boolean {
  const state = getConsentState();
  return state === 'accepted';
}

/**
 * Generate a session ID for anonymous tracking
 * This is NOT PII - it's a random identifier that doesn't persist long-term
 */
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';

  const SESSION_KEY = 'jv_session_id';
  let sessionId = sessionStorage.getItem(SESSION_KEY);

  if (!sessionId) {
    // Generate a random session ID
    sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }

  return sessionId;
}

/**
 * Clear consent state (for testing or user request)
 */
export function clearConsentState(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(CONSENT_STORAGE_KEY);
  document.cookie = `${CONSENT_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearConsentState,
  getConsentState,
  getOrCreateSessionId,
  isDNTEnabled,
  isGPCEnabled,
  isTrackingAllowed,
  setConsentState,
} from '@/lib/tracking/consent';

function setCookie(value: string) {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('tracking consent', () => {
  beforeEach(() => {
    setCookie('');
    localStorage.clear();
    sessionStorage.clear();
    // Reset navigator overrides
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'doNotTrack', {
      configurable: true,
      value: null,
    });
  });

  describe('isGPCEnabled', () => {
    it('returns false when navigator.globalPrivacyControl is undefined', () => {
      expect(isGPCEnabled()).toBe(false);
    });

    it('returns true when navigator.globalPrivacyControl is true', () => {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        configurable: true,
        value: true,
      });
      expect(isGPCEnabled()).toBe(true);
    });

    it('returns false when navigator.globalPrivacyControl is false', () => {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        configurable: true,
        value: false,
      });
      expect(isGPCEnabled()).toBe(false);
    });
  });

  describe('isDNTEnabled', () => {
    it('returns false when doNotTrack is null', () => {
      expect(isDNTEnabled()).toBe(false);
    });

    it('returns true when doNotTrack is "1"', () => {
      Object.defineProperty(navigator, 'doNotTrack', {
        configurable: true,
        value: '1',
      });
      expect(isDNTEnabled()).toBe(true);
    });

    it('returns true when doNotTrack is "yes"', () => {
      Object.defineProperty(navigator, 'doNotTrack', {
        configurable: true,
        value: 'yes',
      });
      expect(isDNTEnabled()).toBe(true);
    });

    it('returns false when doNotTrack is "0"', () => {
      Object.defineProperty(navigator, 'doNotTrack', {
        configurable: true,
        value: '0',
      });
      expect(isDNTEnabled()).toBe(false);
    });
  });

  describe('getConsentState', () => {
    it('returns "undecided" when no storage and no cookie', () => {
      expect(getConsentState()).toBe('undecided');
    });

    it('returns "accepted" from localStorage', () => {
      localStorage.setItem('jovie_tracking_consent', 'accepted');
      expect(getConsentState()).toBe('accepted');
    });

    it('returns "rejected" from localStorage', () => {
      localStorage.setItem('jovie_tracking_consent', 'rejected');
      expect(getConsentState()).toBe('rejected');
    });

    it('falls back to cookie when localStorage has no value', () => {
      setCookie('jv_tracking_consent=accepted');
      expect(getConsentState()).toBe('accepted');
    });

    it('falls back to cookie with rejected value', () => {
      setCookie('jv_tracking_consent=rejected');
      expect(getConsentState()).toBe('rejected');
    });

    it('returns "gpc-opted-out" when GPC is enabled', () => {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        configurable: true,
        value: true,
      });
      // Even if localStorage says accepted, GPC takes precedence
      localStorage.setItem('jovie_tracking_consent', 'accepted');
      expect(getConsentState()).toBe('gpc-opted-out');
    });

    it('returns "undecided" when localStorage has invalid value', () => {
      localStorage.setItem('jovie_tracking_consent', 'something-else');
      expect(getConsentState()).toBe('undecided');
    });

    it('returns "undecided" when cookie has invalid value', () => {
      setCookie('jv_tracking_consent=maybe');
      expect(getConsentState()).toBe('undecided');
    });

    it('localStorage takes precedence over cookie', () => {
      localStorage.setItem('jovie_tracking_consent', 'rejected');
      setCookie('jv_tracking_consent=accepted');
      expect(getConsentState()).toBe('rejected');
    });
  });

  describe('isTrackingAllowed', () => {
    it('returns true only when consent state is "accepted"', () => {
      localStorage.setItem('jovie_tracking_consent', 'accepted');
      expect(isTrackingAllowed()).toBe(true);
    });

    it('returns false when consent is "rejected"', () => {
      localStorage.setItem('jovie_tracking_consent', 'rejected');
      expect(isTrackingAllowed()).toBe(false);
    });

    it('returns false when consent is "undecided"', () => {
      expect(isTrackingAllowed()).toBe(false);
    });

    it('returns false when GPC is enabled', () => {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        configurable: true,
        value: true,
      });
      expect(isTrackingAllowed()).toBe(false);
    });
  });

  describe('setConsentState', () => {
    it('sets value in localStorage', () => {
      setConsentState('accepted');
      expect(localStorage.getItem('jovie_tracking_consent')).toBe('accepted');
    });

    it('sets cookie with correct name', () => {
      setConsentState('rejected');
      expect(document.cookie).toContain('jv_tracking_consent=rejected');
    });

    it('can set accepted then rejected', () => {
      setConsentState('accepted');
      expect(localStorage.getItem('jovie_tracking_consent')).toBe('accepted');
      setConsentState('rejected');
      expect(localStorage.getItem('jovie_tracking_consent')).toBe('rejected');
    });
  });

  describe('getOrCreateSessionId', () => {
    it('generates a session ID and caches in sessionStorage', () => {
      const id = getOrCreateSessionId();
      expect(id).toBeTruthy();
      expect(id.length).toBeGreaterThan(0);
      // Contains a timestamp prefix and hex
      expect(id).toMatch(/^\d+-[0-9a-f]+$/);
    });

    it('returns the same ID on subsequent calls', () => {
      const first = getOrCreateSessionId();
      const second = getOrCreateSessionId();
      expect(first).toBe(second);
    });

    it('stores the session ID in sessionStorage', () => {
      const id = getOrCreateSessionId();
      expect(sessionStorage.getItem('jv_session_id')).toBe(id);
    });
  });

  describe('clearConsentState', () => {
    it('removes value from localStorage', () => {
      localStorage.setItem('jovie_tracking_consent', 'accepted');
      clearConsentState();
      expect(localStorage.getItem('jovie_tracking_consent')).toBeNull();
    });

    it('clears the cookie by setting expired date', () => {
      setConsentState('accepted');
      clearConsentState();
      // After clearing, getConsentState should return undecided
      expect(getConsentState()).toBe('undecided');
    });
  });
});

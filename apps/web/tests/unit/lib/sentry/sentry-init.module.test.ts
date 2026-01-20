/**
 * Sentry Tests - Init Module
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _resetSentryModeForTesting,
  detectSentryMode,
  getSentryMode,
  isDashboardRoute as initIsDashboardRoute,
  isPublicRoute as initIsPublicRoute,
  isFullModeActive,
  isLiteModeActive,
  isSentryInitialized,
} from '@/lib/sentry/init';

describe('Sentry Init Module', () => {
  beforeEach(() => {
    _resetSentryModeForTesting();
  });

  afterEach(() => {
    _resetSentryModeForTesting();
  });

  describe('isDashboardRoute (from init)', () => {
    it('should identify dashboard routes', () => {
      expect(initIsDashboardRoute('/app')).toBe(true);
      expect(initIsDashboardRoute('/app/dashboard')).toBe(true);
      expect(initIsDashboardRoute('/account')).toBe(true);
    });

    it('should not match non-dashboard routes', () => {
      expect(initIsDashboardRoute('/')).toBe(false);
      expect(initIsDashboardRoute('/artists')).toBe(false);
      expect(initIsDashboardRoute('/beyonce')).toBe(false);
    });
  });

  describe('isPublicRoute (from init)', () => {
    it('should identify public routes', () => {
      expect(initIsPublicRoute('/')).toBe(true);
      expect(initIsPublicRoute('/artists')).toBe(true);
      expect(initIsPublicRoute('/beyonce')).toBe(true);
    });

    it('should not match dashboard routes', () => {
      expect(initIsPublicRoute('/app')).toBe(false);
      expect(initIsPublicRoute('/account')).toBe(false);
    });
  });

  describe('detectSentryMode', () => {
    it('should return "full" for dashboard routes', () => {
      expect(detectSentryMode('/app')).toBe('full');
      expect(detectSentryMode('/app/dashboard')).toBe('full');
      expect(detectSentryMode('/account')).toBe('full');
    });

    it('should return "lite" for public routes', () => {
      expect(detectSentryMode('/')).toBe('lite');
      expect(detectSentryMode('/artists')).toBe('lite');
      expect(detectSentryMode('/beyonce')).toBe('lite');
    });

    it('should return "lite" for unknown routes (safe default)', () => {
      expect(detectSentryMode('/some-random-path')).toBe('lite');
    });
  });

  describe('state tracking functions', () => {
    it('should start with "none" mode', () => {
      expect(getSentryMode()).toBe('none');
    });

    it('should report not initialized initially', () => {
      expect(isSentryInitialized()).toBe(false);
    });

    it('should report full mode as inactive initially', () => {
      expect(isFullModeActive()).toBe(false);
    });

    it('should report lite mode as inactive initially', () => {
      expect(isLiteModeActive()).toBe(false);
    });
  });

  describe('_resetSentryModeForTesting', () => {
    it('should reset mode to "none"', () => {
      // Mode is already set to 'none' by beforeEach, but verify reset works
      _resetSentryModeForTesting();
      expect(getSentryMode()).toBe('none');
    });
  });
});

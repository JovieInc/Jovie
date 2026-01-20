/**
 * Unit tests for Security Headers Module - Helper Functions
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findHeaderByKey,
  getEnvironmentContext,
  isNonLocalEnvironment,
  isValidSecurityHeader,
  type SecurityHeader,
} from '@/lib/security/headers';

describe('Security Headers - Helper Functions', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('isNonLocalEnvironment', () => {
    it('returns false when VERCEL_ENV is not set', () => {
      vi.stubEnv('VERCEL_ENV', '');
      expect(isNonLocalEnvironment()).toBe(false);
    });

    it('returns false when VERCEL_ENV is development', () => {
      vi.stubEnv('VERCEL_ENV', 'development');
      expect(isNonLocalEnvironment()).toBe(false);
    });

    it('returns true when VERCEL_ENV is production', () => {
      vi.stubEnv('VERCEL_ENV', 'production');
      expect(isNonLocalEnvironment()).toBe(true);
    });

    it('returns true when VERCEL_ENV is preview', () => {
      vi.stubEnv('VERCEL_ENV', 'preview');
      expect(isNonLocalEnvironment()).toBe(true);
    });
  });

  describe('getEnvironmentContext', () => {
    it('returns production context when in production', () => {
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.stubEnv('NODE_ENV', 'production');
      const context = getEnvironmentContext();
      expect(context.isProduction).toBe(true);
      expect(context.isDevelopment).toBe(false);
    });

    it('returns development context when in development', () => {
      vi.stubEnv('VERCEL_ENV', '');
      vi.stubEnv('NODE_ENV', 'development');
      const context = getEnvironmentContext();
      expect(context.isProduction).toBe(false);
      expect(context.isDevelopment).toBe(true);
    });
  });

  describe('isValidSecurityHeader', () => {
    it('returns true for valid header', () => {
      const validHeader: SecurityHeader = { key: 'X-Test', value: 'test' };
      expect(isValidSecurityHeader(validHeader)).toBe(true);
    });

    it('returns false for empty key', () => {
      const invalidHeader: SecurityHeader = { key: '', value: 'test' };
      expect(isValidSecurityHeader(invalidHeader)).toBe(false);
    });

    it('returns false for empty value', () => {
      const invalidHeader: SecurityHeader = { key: 'X-Test', value: '' };
      expect(isValidSecurityHeader(invalidHeader)).toBe(false);
    });

    it('returns false for non-string key', () => {
      const invalidHeader = {
        key: 123,
        value: 'test',
      } as unknown as SecurityHeader;
      expect(isValidSecurityHeader(invalidHeader)).toBe(false);
    });

    it('returns false for non-string value', () => {
      const invalidHeader = {
        key: 'X-Test',
        value: 123,
      } as unknown as SecurityHeader;
      expect(isValidSecurityHeader(invalidHeader)).toBe(false);
    });
  });

  describe('findHeaderByKey', () => {
    const testHeaders: SecurityHeader[] = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
    ];

    it('finds header with exact key match', () => {
      const header = findHeaderByKey(testHeaders, 'X-Frame-Options');
      expect(header).toEqual({ key: 'X-Frame-Options', value: 'DENY' });
    });

    it('finds header case-insensitively', () => {
      const header = findHeaderByKey(testHeaders, 'x-frame-options');
      expect(header).toEqual({ key: 'X-Frame-Options', value: 'DENY' });
    });

    it('returns undefined for non-existent key', () => {
      const header = findHeaderByKey(testHeaders, 'X-Nonexistent');
      expect(header).toBeUndefined();
    });

    it('returns undefined for empty array', () => {
      const header = findHeaderByKey([], 'X-Frame-Options');
      expect(header).toBeUndefined();
    });
  });
});

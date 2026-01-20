/**
 * Unit tests for Security Headers Module - Builder Functions
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildApiSecurityHeaders,
  buildBaseSecurityHeaders,
  buildStaticAssetSecurityHeaders,
  findHeaderByKey,
  getDevelopmentSecurityHeaders,
  getProductionSecurityHeaders,
  isValidSecurityHeader,
} from '@/lib/security/headers';

describe('Security Headers - Header Builder Functions', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('buildBaseSecurityHeaders', () => {
    it('includes all base security headers in development', () => {
      const headers = buildBaseSecurityHeaders({
        env: { isProduction: false, isDevelopment: true },
        includeProductionHeaders: false,
      });

      expect(findHeaderByKey(headers, 'X-Frame-Options')).toBeDefined();
      expect(findHeaderByKey(headers, 'X-Content-Type-Options')).toBeDefined();
      expect(findHeaderByKey(headers, 'Referrer-Policy')).toBeDefined();
      expect(findHeaderByKey(headers, 'Permissions-Policy')).toBeDefined();
    });

    it('excludes production-only headers in development', () => {
      const headers = buildBaseSecurityHeaders({
        env: { isProduction: false, isDevelopment: true },
        includeProductionHeaders: false,
      });

      expect(
        findHeaderByKey(headers, 'Strict-Transport-Security')
      ).toBeUndefined();
      expect(
        findHeaderByKey(headers, 'Cross-Origin-Opener-Policy')
      ).toBeUndefined();
    });

    it('includes production-only headers in production', () => {
      const headers = buildBaseSecurityHeaders({
        env: { isProduction: true, isDevelopment: false },
        includeProductionHeaders: true,
      });

      expect(
        findHeaderByKey(headers, 'Strict-Transport-Security')
      ).toBeDefined();
      expect(
        findHeaderByKey(headers, 'Cross-Origin-Opener-Policy')
      ).toBeDefined();
    });

    it('respects includeProductionHeaders override', () => {
      const headers = buildBaseSecurityHeaders({
        env: { isProduction: false, isDevelopment: true },
        includeProductionHeaders: true,
      });

      expect(
        findHeaderByKey(headers, 'Strict-Transport-Security')
      ).toBeDefined();
      expect(
        findHeaderByKey(headers, 'Cross-Origin-Opener-Policy')
      ).toBeDefined();
    });

    it('all returned headers are valid', () => {
      const headers = buildBaseSecurityHeaders({
        includeProductionHeaders: true,
      });

      for (const header of headers) {
        expect(isValidSecurityHeader(header)).toBe(true);
      }
    });
  });

  describe('buildApiSecurityHeaders', () => {
    it('includes base security headers', () => {
      const headers = buildApiSecurityHeaders({
        includeProductionHeaders: false,
      });

      expect(findHeaderByKey(headers, 'X-Frame-Options')).toBeDefined();
      expect(findHeaderByKey(headers, 'X-Content-Type-Options')).toBeDefined();
    });

    it('excludes CORP in development', () => {
      const headers = buildApiSecurityHeaders({
        env: { isProduction: false, isDevelopment: true },
        includeProductionHeaders: false,
      });

      expect(
        findHeaderByKey(headers, 'Cross-Origin-Resource-Policy')
      ).toBeUndefined();
    });

    it('includes CORP same-origin in production', () => {
      const headers = buildApiSecurityHeaders({
        env: { isProduction: true, isDevelopment: false },
        includeProductionHeaders: true,
      });

      const corpHeader = findHeaderByKey(
        headers,
        'Cross-Origin-Resource-Policy'
      );
      expect(corpHeader).toBeDefined();
      expect(corpHeader?.value).toBe('same-origin');
    });

    it('all returned headers are valid', () => {
      const headers = buildApiSecurityHeaders({
        includeProductionHeaders: true,
      });

      for (const header of headers) {
        expect(isValidSecurityHeader(header)).toBe(true);
      }
    });
  });

  describe('buildStaticAssetSecurityHeaders', () => {
    it('includes base security headers', () => {
      const headers = buildStaticAssetSecurityHeaders({
        includeProductionHeaders: false,
      });

      expect(findHeaderByKey(headers, 'X-Frame-Options')).toBeDefined();
      expect(findHeaderByKey(headers, 'X-Content-Type-Options')).toBeDefined();
    });

    it('excludes CORP in development', () => {
      const headers = buildStaticAssetSecurityHeaders({
        env: { isProduction: false, isDevelopment: true },
        includeProductionHeaders: false,
      });

      expect(
        findHeaderByKey(headers, 'Cross-Origin-Resource-Policy')
      ).toBeUndefined();
    });

    it('includes CORP cross-origin in production', () => {
      const headers = buildStaticAssetSecurityHeaders({
        env: { isProduction: true, isDevelopment: false },
        includeProductionHeaders: true,
      });

      const corpHeader = findHeaderByKey(
        headers,
        'Cross-Origin-Resource-Policy'
      );
      expect(corpHeader).toBeDefined();
      expect(corpHeader?.value).toBe('cross-origin');
    });

    it('all returned headers are valid', () => {
      const headers = buildStaticAssetSecurityHeaders({
        includeProductionHeaders: true,
      });

      for (const header of headers) {
        expect(isValidSecurityHeader(header)).toBe(true);
      }
    });
  });

  describe('getProductionSecurityHeaders', () => {
    it('includes all base headers', () => {
      const headers = getProductionSecurityHeaders();

      expect(findHeaderByKey(headers, 'X-Frame-Options')).toBeDefined();
      expect(findHeaderByKey(headers, 'X-Content-Type-Options')).toBeDefined();
      expect(findHeaderByKey(headers, 'Referrer-Policy')).toBeDefined();
      expect(findHeaderByKey(headers, 'Permissions-Policy')).toBeDefined();
    });

    it('includes production-only headers', () => {
      const headers = getProductionSecurityHeaders();

      expect(
        findHeaderByKey(headers, 'Strict-Transport-Security')
      ).toBeDefined();
      expect(
        findHeaderByKey(headers, 'Cross-Origin-Opener-Policy')
      ).toBeDefined();
    });

    it('returns 6 headers total', () => {
      const headers = getProductionSecurityHeaders();
      expect(headers).toHaveLength(6);
    });
  });

  describe('getDevelopmentSecurityHeaders', () => {
    it('includes base headers', () => {
      const headers = getDevelopmentSecurityHeaders();

      expect(findHeaderByKey(headers, 'X-Frame-Options')).toBeDefined();
      expect(findHeaderByKey(headers, 'X-Content-Type-Options')).toBeDefined();
      expect(findHeaderByKey(headers, 'Referrer-Policy')).toBeDefined();
      expect(findHeaderByKey(headers, 'Permissions-Policy')).toBeDefined();
    });

    it('excludes production-only headers', () => {
      const headers = getDevelopmentSecurityHeaders();

      expect(
        findHeaderByKey(headers, 'Strict-Transport-Security')
      ).toBeUndefined();
      expect(
        findHeaderByKey(headers, 'Cross-Origin-Opener-Policy')
      ).toBeUndefined();
    });

    it('returns 4 headers total', () => {
      const headers = getDevelopmentSecurityHeaders();
      expect(headers).toHaveLength(4);
    });
  });
});

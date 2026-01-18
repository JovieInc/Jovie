import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCspReportUri,
  buildReportingEndpointsHeader,
  buildReportToHeader,
  CSP_REPORT_GROUP,
  getCspReportUri,
  parseSentryDsn,
} from '@/lib/security/csp-reporting';

describe('csp-reporting', () => {
  describe('parseSentryDsn', () => {
    it('parses a valid Sentry DSN', () => {
      const dsn = 'https://abc123def456@o123456.ingest.us.sentry.io/7891011';
      const result = parseSentryDsn(dsn);

      expect(result).toEqual({
        publicKey: 'abc123def456',
        host: 'o123456.ingest.us.sentry.io',
        projectId: '7891011',
      });
    });

    it('returns null for invalid URL', () => {
      expect(parseSentryDsn('not-a-url')).toBeNull();
    });

    it('returns null for missing public key', () => {
      expect(parseSentryDsn('https://example.com/123')).toBeNull();
    });

    it('returns null for missing project ID', () => {
      expect(parseSentryDsn('https://key@example.com/')).toBeNull();
    });
  });

  describe('buildCspReportUri', () => {
    it('builds correct report URI from DSN', () => {
      const dsn = 'https://abc123def456@o123456.ingest.us.sentry.io/7891011';
      const result = buildCspReportUri(dsn);

      expect(result).toBe(
        'https://o123456.ingest.us.sentry.io/api/7891011/security/?sentry_key=abc123def456'
      );
    });

    it('returns null for invalid DSN', () => {
      expect(buildCspReportUri('invalid')).toBeNull();
    });
  });

  describe('getCspReportUri', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('returns explicit URI if set', () => {
      process.env.NEXT_PUBLIC_SENTRY_CSP_REPORT_URI =
        'https://explicit-uri.example.com';
      process.env.NEXT_PUBLIC_SENTRY_DSN =
        'https://key@org.ingest.sentry.io/123';

      const result = getCspReportUri();
      expect(result).toBe('https://explicit-uri.example.com');
    });

    it('falls back to DSN-generated URI', () => {
      delete process.env.NEXT_PUBLIC_SENTRY_CSP_REPORT_URI;
      process.env.NEXT_PUBLIC_SENTRY_DSN =
        'https://testkey@o999.ingest.sentry.io/555';

      const result = getCspReportUri();
      expect(result).toBe(
        'https://o999.ingest.sentry.io/api/555/security/?sentry_key=testkey'
      );
    });

    it('returns null if neither env var is set', () => {
      delete process.env.NEXT_PUBLIC_SENTRY_CSP_REPORT_URI;
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;

      const result = getCspReportUri();
      expect(result).toBeNull();
    });
  });

  describe('buildReportToHeader', () => {
    it('builds correct Report-To header JSON', () => {
      const reportUri = 'https://example.com/csp-report';
      const result = buildReportToHeader(reportUri);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({
        group: CSP_REPORT_GROUP,
        max_age: 10886400,
        endpoints: [{ url: reportUri }],
      });
    });

    it('uses CSP_REPORT_GROUP as group name', () => {
      const result = buildReportToHeader('https://example.com');
      const parsed = JSON.parse(result);

      expect(parsed.group).toBe('csp-endpoint');
    });
  });

  describe('buildReportingEndpointsHeader', () => {
    it('builds correct Reporting-Endpoints header', () => {
      const reportUri = 'https://example.com/csp-report';
      const result = buildReportingEndpointsHeader(reportUri);

      expect(result).toBe(`${CSP_REPORT_GROUP}="${reportUri}"`);
    });
  });
});

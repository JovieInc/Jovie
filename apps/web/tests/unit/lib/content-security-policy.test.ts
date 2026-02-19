import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildContentSecurityPolicy,
  buildContentSecurityPolicyReportOnly,
} from '@/lib/security/content-security-policy';

const findDirective = (csp: string, directive: string) =>
  csp.split('; ').find(section => section.startsWith(directive));

describe('buildContentSecurityPolicy', () => {
  it('includes a nonce and excludes unsafe-inline in script-src', () => {
    const nonce = 'test-nonce';
    const csp = buildContentSecurityPolicy({ nonce, isDev: false });
    const scriptSrc = findDirective(csp, 'script-src');

    expect(scriptSrc).toContain(`'nonce-${nonce}'`);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('includes unsafe-eval when toolbar is enabled', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
      enableToolbar: true,
    });
    const scriptSrc = findDirective(csp, 'script-src');

    expect(scriptSrc).toContain("'unsafe-eval'");
  });

  it('excludes unsafe-eval when toolbar is disabled', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
      enableToolbar: false,
    });
    const scriptSrc = findDirective(csp, 'script-src');

    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it('includes vercel.live in frame-src when toolbar is enabled', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
      enableToolbar: true,
    });
    const frameSrc = findDirective(csp, 'frame-src');

    expect(frameSrc).toContain('https://vercel.live');
  });

  it('excludes vercel.live from frame-src when toolbar is disabled', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
      enableToolbar: false,
    });
    const frameSrc = findDirective(csp, 'frame-src');

    expect(frameSrc).not.toContain('https://vercel.live');
  });

  it('does not include report directives in enforcing CSP', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'test-nonce' });

    expect(csp).not.toContain('report-uri');
    expect(csp).not.toContain('report-to');
  });
});

describe('buildContentSecurityPolicyReportOnly', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns null when no Sentry DSN is configured', () => {
    delete process.env.NEXT_PUBLIC_SENTRY_CSP_REPORT_URI;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    const result = buildContentSecurityPolicyReportOnly({
      nonce: 'test-nonce',
    });
    expect(result).toBeNull();
  });

  it('includes report-uri when Sentry DSN is configured', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://key@o123.ingest.sentry.io/456';

    const result = buildContentSecurityPolicyReportOnly({
      nonce: 'test-nonce',
    });

    expect(result).not.toBeNull();
    expect(result).toContain('report-uri');
    expect(result).toContain('o123.ingest.sentry.io/api/456/security/');
  });

  it('includes report-to directive', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://key@o123.ingest.sentry.io/456';

    const result = buildContentSecurityPolicyReportOnly({
      nonce: 'test-nonce',
    });

    expect(result).toContain('report-to csp-endpoint');
  });

  it('includes all base directives plus reporting', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://key@o123.ingest.sentry.io/456';

    const result = buildContentSecurityPolicyReportOnly({
      nonce: 'test-nonce',
    });

    expect(result).toContain("default-src 'self'");
    expect(result).toContain("script-src 'self'");
    expect(result).toContain('report-uri');
  });
});

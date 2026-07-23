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

    expect(scriptSrc).toContain("'self'");
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

  it('includes vercel.com in connect-src from canonical registry', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
    });
    const connectSrc = findDirective(csp, 'connect-src');

    expect(connectSrc).toContain('https://vercel.com');
  });

  it('includes Vercel Blob storage in connect-src for client uploads', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
    });
    const connectSrc = findDirective(csp, 'connect-src');

    expect(connectSrc).toContain('https://*.blob.vercel-storage.com');
    expect(connectSrc).toContain('https://*.public.blob.vercel-storage.com');
  });

  it('includes api.qrserver.com in connect-src for QR code downloads', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
    });
    const connectSrc = findDirective(csp, 'connect-src');

    expect(connectSrc).toContain('https://api.qrserver.com');
  });

  it('includes Sentry regional ingest wildcard in connect-src', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
    });
    const connectSrc = findDirective(csp, 'connect-src');

    expect(connectSrc).toContain('https://*.ingest.sentry.io');
    expect(connectSrc).toContain('https://*.ingest.us.sentry.io');
  });

  it.skip('includes staging Clerk host in script, connect, and frame directives (retired Clerk FAPI)', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
      enableToolbar: false,
    });
    const scriptSrc = findDirective(csp, 'script-src');
    const connectSrc = findDirective(csp, 'connect-src');
    const frameSrc = findDirective(csp, 'frame-src');

    expect(scriptSrc).toContain('https://clerk.staging.jov.ie');
    expect(connectSrc).toContain('https://clerk.staging.jov.ie');
    expect(connectSrc).toContain('wss://clerk.staging.jov.ie');
    expect(frameSrc).toContain('https://clerk.staging.jov.ie');
  });

  it('includes Google Analytics domains in script-src and connect-src', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
    });
    const scriptSrc = findDirective(csp, 'script-src');
    const connectSrc = findDirective(csp, 'connect-src');

    expect(scriptSrc).toContain('https://www.googletagmanager.com');
    expect(connectSrc).toContain('https://www.google-analytics.com');
    expect(connectSrc).toContain('https://analytics.google.com');
    expect(connectSrc).toContain('https://*.google-analytics.com');
  });

  it('includes GTM domain in img-src for conversion tracking pixels', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
    });
    const imgSrc = findDirective(csp, 'img-src');

    expect(imgSrc).toContain('https://www.googletagmanager.com');
  });

  it('includes vercel analytics inline script hash in script-src', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
    });
    const scriptSrc = findDirective(csp, 'script-src');

    expect(scriptSrc).toContain(
      "'sha256-k844ZRfHq5VBCg5bFxVtnBCvPUU7TVV7m1sDHs/cJXk='"
    );
  });

  it('does not include report directives in enforcing CSP', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'test-nonce' });

    expect(csp).not.toContain('report-uri');
    expect(csp).not.toContain('report-to');
  });

  it('includes all major platform CDN domains in img-src', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
    });
    const imgSrc = findDirective(csp, 'img-src');

    // Social networks
    expect(imgSrc).toContain('https://*.fbcdn.net');
    expect(imgSrc).toContain('https://*.twimg.com');
    expect(imgSrc).toContain('https://*.tiktokcdn.com');
    expect(imgSrc).toContain('https://*.ytimg.com');
    expect(imgSrc).toContain('https://*.licdn.com');
    expect(imgSrc).toContain('https://*.googleusercontent.com');

    // Music DSPs
    expect(imgSrc).toContain('https://i.scdn.co');
    expect(imgSrc).toContain('https://*.mzstatic.com');
    expect(imgSrc).toContain('https://*.dzcdn.net');
    expect(imgSrc).toContain('https://*.sndcdn.com');
    expect(imgSrc).toContain('https://*.bcbits.com');

    // Creator platforms
    expect(imgSrc).toContain('https://cdn.discordapp.com');
    expect(imgSrc).toContain('https://avatars.githubusercontent.com');

    // Infrastructure
    expect(imgSrc).toContain('https://*.blob.vercel-storage.com');
    expect(imgSrc).toContain('https://img.clerk.com');
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

describe('Google Identity Services allowlist (JOV-4369)', () => {
  it('allows the GIS script origin in script-src', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
    });
    const scriptSrc = findDirective(csp, 'script-src');

    expect(scriptSrc).toContain('https://accounts.google.com');
  });

  it('allows the One Tap iframe origin in frame-src', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: false,
    });
    const frameSrc = findDirective(csp, 'frame-src');

    expect(frameSrc).toContain('https://accounts.google.com');
  });
});

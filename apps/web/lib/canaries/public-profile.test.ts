import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildReport,
  buildVisitPayload,
  CANARY_CREATOR_HANDLE,
  CANARY_CREATOR_SPOTIFY_ID,
  CANARY_ROUTES,
  type CanaryCheckResult,
  checkHttpGet,
  formatReportSummary,
  hasServerError,
  isOkStatus,
} from './public-profile';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isOkStatus', () => {
  it('accepts 200', () => {
    expect(isOkStatus(200)).toBe(true);
  });

  it('accepts 301', () => {
    expect(isOkStatus(301)).toBe(true);
  });

  it('accepts 307 (pay redirect)', () => {
    expect(isOkStatus(307)).toBe(true);
  });

  it('rejects 400', () => {
    expect(isOkStatus(400)).toBe(false);
  });

  it('rejects 404', () => {
    expect(isOkStatus(404)).toBe(false);
  });

  it('rejects 500', () => {
    expect(isOkStatus(500)).toBe(false);
  });
});

describe('hasServerError', () => {
  it('detects "Application error"', () => {
    expect(
      hasServerError('Application error: a client-side exception occurred')
    ).toBe(true);
  });

  it('detects "Internal Server Error"', () => {
    expect(hasServerError('500 Internal Server Error')).toBe(true);
  });

  it('detects "Unhandled Runtime Error"', () => {
    expect(hasServerError('Unhandled Runtime Error: TypeError: ...')).toBe(
      true
    );
  });

  it('detects next.js 404 message', () => {
    expect(hasServerError('This page could not be found.')).toBe(true);
  });

  it('returns false for healthy body', () => {
    expect(
      hasServerError(
        '<html><head><title>Tim White — Jovie</title></head></html>'
      )
    ).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(hasServerError('INTERNAL SERVER ERROR')).toBe(true);
  });
});

describe('buildVisitPayload', () => {
  it('includes profileId', () => {
    const payload = buildVisitPayload('some-uuid-here');
    expect(payload.profileId).toBe('some-uuid-here');
  });

  it('includes canary user agent', () => {
    const payload = buildVisitPayload('id');
    expect(typeof payload.userAgent).toBe('string');
    expect((payload.userAgent as string).toLowerCase()).toContain('canary');
  });

  it('sets utm source to canary', () => {
    const payload = buildVisitPayload('id');
    const utm = payload.utmParams as { source: string; medium: string };
    expect(utm.source).toBe('canary');
    expect(utm.medium).toBe('monitoring');
  });
});

describe('checkHttpGet', () => {
  it('rejects a 200 response containing a server error body without a custom assertion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Application error', { status: 200 }))
    );

    const result = await checkHttpGet(
      'alerts-200',
      'https://jov.ie/tim/alerts'
    );

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(200);
    expect(result.detail).toBe('Response body contains server error indicator');
  });
});

describe('buildReport', () => {
  const makePassing = (name: string): CanaryCheckResult => ({
    name,
    ok: true,
    statusCode: 200,
    durationMs: 50,
  });

  const makeFailing = (name: string): CanaryCheckResult => ({
    name,
    ok: false,
    statusCode: 500,
    detail: 'HTTP 500',
    durationMs: 100,
  });

  it('marks report as pass when all checks pass', () => {
    const report = buildReport(
      '2026-01-01T00:00:00Z',
      [makePassing('a'), makePassing('b')],
      150
    );
    expect(report.pass).toBe(true);
    expect(report.checks).toHaveLength(2);
  });

  it('marks report as fail when any check fails', () => {
    const report = buildReport(
      '2026-01-01T00:00:00Z',
      [makePassing('a'), makeFailing('b')],
      200
    );
    expect(report.pass).toBe(false);
  });

  it('stores runAt and totalDurationMs', () => {
    const report = buildReport('2026-05-16T06:13:00Z', [], 0);
    expect(report.runAt).toBe('2026-05-16T06:13:00Z');
    expect(report.totalDurationMs).toBe(0);
  });
});

describe('formatReportSummary', () => {
  it('includes PASS for all-passing report', () => {
    const report = buildReport(
      '2026-05-16T00:00:00Z',
      [{ name: 'x', ok: true, durationMs: 10 }],
      10
    );
    expect(formatReportSummary(report)).toContain('PASS');
    expect(formatReportSummary(report)).not.toContain('failed:');
  });

  it('includes FAIL and the failing check name', () => {
    const report = buildReport(
      '2026-05-16T00:00:00Z',
      [
        { name: 'profile-200', ok: true, durationMs: 10 },
        {
          name: 'audience-visit',
          ok: false,
          detail: 'timeout',
          durationMs: 10000,
        },
      ],
      10010
    );
    const summary = formatReportSummary(report);
    expect(summary).toContain('FAIL');
    expect(summary).toContain('audience-visit');
  });
});

describe('canary constants', () => {
  it('CANARY_CREATOR_HANDLE is tim (founder identity rule)', () => {
    expect(CANARY_CREATOR_HANDLE).toBe('tim');
  });

  it('CANARY_CREATOR_SPOTIFY_ID is 4u (canonical Spotify ID)', () => {
    expect(CANARY_CREATOR_SPOTIFY_ID).toBe('4u');
  });

  it('CANARY_ROUTES includes /tim, /tim/alerts, /tim/pay', () => {
    expect(CANARY_ROUTES.profile).toBe('/tim');
    expect(CANARY_ROUTES.alerts).toBe('/tim/alerts');
    expect(CANARY_ROUTES.pay).toBe('/tim/pay');
  });
});

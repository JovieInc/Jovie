import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCspReportUriMock = vi.hoisted(() =>
  vi.fn().mockReturnValue('https://example.com/csp-report')
);

vi.mock('@/lib/security/csp-reporting', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/security/csp-reporting')>();
  return {
    ...actual,
    getCspReportUri: getCspReportUriMock,
  };
});

describe('buildFinalResponse CSP report URI caching', () => {
  beforeEach(() => {
    vi.resetModules();
    getCspReportUriMock.mockClear();
    getCspReportUriMock.mockReturnValue('https://example.com/csp-report');
  });

  it('resolves getCspReportUri once at module load, not per response', async () => {
    const { buildFinalResponse } = await import('@/lib/auth/final-response');
    expect(getCspReportUriMock).toHaveBeenCalledTimes(1);

    const pathInfo = {
      needsNonce: true,
      isProtectedPath: true,
      isAuthPath: false,
      isAuthCallbackPath: false,
      isSensitiveAPI: false,
      publicProfileCandidate: null,
    };

    const req = new NextRequest('https://jov.ie/app/dashboard');
    const res = NextResponse.next();

    buildFinalResponse(req, res, pathInfo, Date.now(), null, 'test-nonce');
    buildFinalResponse(req, res, pathInfo, Date.now(), null, 'test-nonce-2');

    expect(getCspReportUriMock).toHaveBeenCalledTimes(1);
    expect(res.headers.get('Content-Security-Policy-Report-Only')).toContain(
      'https://example.com/csp-report'
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  redeemStoredDesktopHandback: vi.fn(),
  captureError: vi.fn().mockResolvedValue(undefined),
  limit: vi.fn(),
}));

vi.mock('@/lib/auth/routing-state.server', () => ({
  redeemStoredDesktopHandback: hoisted.redeemStoredDesktopHandback,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

vi.mock('@/lib/rate-limit', () => ({
  allowIfRateLimitBackendDegraded: (result: {
    success: boolean;
    unavailable?: boolean;
  }) =>
    !result.success && result.unavailable
      ? { ...result, success: true }
      : result,
  createRateLimitHeaders: () => ({}),
  generalLimiter: { limit: hoisted.limit },
  getClientIP: () => '203.0.113.7',
}));

const { POST } = await import('@/app/api/auth/native/handback/route');

const FLOW = 'desktop_flow_nonce_12345';
const VERIFIER = 'v'.repeat(86);
const VALID_BODY = {
  client: 'electron',
  desktopFlow: FLOW,
  codeVerifier: VERIFIER,
  returnCode: 'bcdf-ghjk',
};

function handbackRequest(body: unknown) {
  return new Request('https://jov.ie/api/auth/native/handback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/native/handback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.limit.mockResolvedValue({ success: true });
    hoisted.redeemStoredDesktopHandback.mockResolvedValue({
      status: 'invalid',
    });
  });

  it('returns the code/state pair for the right return code and verifier', async () => {
    hoisted.redeemStoredDesktopHandback.mockResolvedValueOnce({
      status: 'complete',
      code: 'code_123',
      state: 'state_123',
    });
    const response = await POST(handbackRequest(VALID_BODY));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({
      status: 'complete',
      code: 'code_123',
      state: 'state_123',
    });
    expect(hoisted.redeemStoredDesktopHandback).toHaveBeenCalledWith({
      desktopFlow: FLOW,
      codeVerifier: VERIFIER,
      returnCode: 'bcdf-ghjk',
      createCodeChallenge: expect.any(Function),
    });
    const { createCodeChallenge } =
      hoisted.redeemStoredDesktopHandback.mock.calls[0][0];
    // RFC 7636 appendix B S256 test vector.
    expect(
      createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    ).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('answers one opaque 401 for any wrong, expired or replayed redemption', async () => {
    const response = await POST(handbackRequest(VALID_BODY));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Invalid return code', status: 'invalid' });
  });

  it.each([
    [{ ...VALID_BODY, client: 'ios' }],
    [{ ...VALID_BODY, desktopFlow: 'short' }],
    [{ ...VALID_BODY, codeVerifier: 'short' }],
    [{ ...VALID_BODY, returnCode: '1234' }],
    [{ ...VALID_BODY, returnCode: '<script>x</script>' }],
    [{ client: 'electron', desktopFlow: FLOW, codeVerifier: VERIFIER }],
  ])('rejects malformed requests before touching the store', async body => {
    const response = await POST(handbackRequest(body));
    expect(response.status).toBe(400);
    expect(hoisted.redeemStoredDesktopHandback).not.toHaveBeenCalled();
  });

  it('rate limits per client IP', async () => {
    hoisted.limit.mockResolvedValueOnce({ success: false });
    const response = await POST(handbackRequest(VALID_BODY));
    expect(response.status).toBe(429);
    expect(hoisted.limit).toHaveBeenCalledWith(
      'auth:desktop-handback:203.0.113.7'
    );
    expect(hoisted.redeemStoredDesktopHandback).not.toHaveBeenCalled();
  });

  it('fails closed with a 500 when the store throws', async () => {
    hoisted.redeemStoredDesktopHandback.mockRejectedValueOnce(new Error('db'));
    const response = await POST(handbackRequest(VALID_BODY));
    expect(response.status).toBe(500);
    expect(hoisted.captureError).toHaveBeenCalled();
  });
});

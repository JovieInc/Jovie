import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockVerifyUnsubscribeToken = vi.hoisted(() => vi.fn());
const mockAddSuppression = vi.hoisted(() => vi.fn());

vi.mock('@/lib/email/unsubscribe-token', () => ({
  verifyUnsubscribeToken: mockVerifyUnsubscribeToken,
}));

vi.mock('@/lib/notifications/suppression', () => ({
  addSuppression: mockAddSuppression,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('GET /api/unsubscribe/claim-invites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('does not reflect the token in the HTML response', async () => {
    mockVerifyUnsubscribeToken.mockReturnValue('test@example.com');

    const { GET } = await import('@/app/api/unsubscribe/claim-invites/route');
    const request = new NextRequest(
      'http://localhost/api/unsubscribe/claim-invites?token=valid-token'
    );

    const response = await GET(request);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Unsubscribe');
    expect(html).not.toContain('valid-token');
    expect(html).not.toContain('name="token"');
  });
});

describe('POST /api/unsubscribe/claim-invites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('accepts the token from the query string', async () => {
    mockVerifyUnsubscribeToken.mockReturnValue('test@example.com');
    mockAddSuppression.mockResolvedValue({
      success: true,
      alreadyExists: false,
    });

    const { POST } = await import('@/app/api/unsubscribe/claim-invites/route');
    const request = new NextRequest(
      'http://localhost/api/unsubscribe/claim-invites?token=valid-token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(),
      }
    );

    const response = await POST(request);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(mockVerifyUnsubscribeToken).toHaveBeenCalledWith('valid-token');
    expect(mockAddSuppression).toHaveBeenCalledWith(
      'test@example.com',
      'user_request',
      'claim_invite_unsubscribe',
      expect.objectContaining({
        metadata: { notes: 'Unsubscribed via claim invite email link' },
      })
    );
    expect(html).toContain("You've been unsubscribed");
  });
});

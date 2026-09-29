import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockContainment, mockSendEmail, mockSelect } = vi.hoisted(
  () => ({
    mockAuth: vi.fn(),
    mockContainment: vi.fn(),
    mockSendEmail: vi.fn(),
    mockSelect: vi.fn(),
  })
);

vi.mock('server-only', () => ({}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockAuth,
}));

vi.mock('@/lib/security/account-security', () => ({
  executeAccountContainment: mockContainment,
  SECURITY_EVENT_TYPES: { PANIC: 'panic', LINKS_RESTORED: 'links_restored' },
  SNAPSHOT_REASONS: {
    UPDATE: 'update',
    PANIC: 'panic',
    PRE_RESTORE: 'pre_restore',
  },
}));

vi.mock('@/lib/db', () => ({
  db: { select: mockSelect },
}));

vi.mock('@/lib/email/send', () => ({
  sendEmail: mockSendEmail,
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

const { POST } = await import('./route');

function buildRequest() {
  return new NextRequest('http://localhost/api/account/security/panic', {
    method: 'POST',
  });
}

function mockPriorPanicQuery(rows: { id: string }[]) {
  mockSelect.mockReturnValue({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve(rows) }),
    }),
  });
}

describe('POST /api/account/security/panic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContainment.mockResolvedValue({
      sessionsRevoked: 3,
      linksFrozen: 5,
      profilesFrozen: 1,
      eventId: 'event-1',
    });
    mockPriorPanicQuery([]);
    mockSendEmail.mockResolvedValue({ success: true });
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const response = await POST(buildRequest());
    expect(response.status).toBe(401);
    expect(mockContainment).not.toHaveBeenCalled();
  });

  it('runs containment and notifies support', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockContainment).toHaveBeenCalledWith(
      expect.objectContaining({ appUserId: 'user-1' })
    );
    expect(body.sessionsRevoked).toBe(3);
    expect(body.linksFrozen).toBe(5);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(body.supportNotified).toBe(true);
  });

  it('skips the support email when a panic already fired within the cooldown', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-1' });
    mockPriorPanicQuery([{ id: 'event-0' }]);

    const response = await POST(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(body.supportNotified).toBe(false);
  });

  it('still reports success when the support notification fails', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-1' });
    mockSendEmail.mockRejectedValue(new Error('resend down'));

    const response = await POST(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.supportNotified).toBe(false);
  });
});

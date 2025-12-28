import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockDbExecute = vi.hoisted(() => vi.fn());
const mockDbTransaction = vi.hoisted(() => vi.fn());
const mockSendNotification = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    execute: mockDbExecute,
    transaction: mockDbTransaction,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: {},
  waitlistInvites: {},
}));

vi.mock('@/lib/notifications/service', () => ({
  sendNotification: mockSendNotification,
}));

vi.mock('@/lib/waitlist/invite', () => ({
  buildWaitlistInviteEmail: vi.fn().mockReturnValue({
    message: { subject: 'Invite', body: 'Test' },
    target: { email: 'test@example.com' },
  }),
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: vi.fn().mockResolvedValue({ ok: true, data: {} }),
}));

describe('POST /api/cron/waitlist-invites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.CRON_SECRET = 'test-secret';
  });

  it('returns 401 without proper authorization', async () => {
    const { POST } = await import('@/app/api/cron/waitlist-invites/route');
    const request = new NextRequest(
      'http://localhost/api/cron/waitlist-invites',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-secret' },
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('skips sending outside send window', async () => {
    // Mock a weekend date
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-06T12:00:00-08:00')); // Saturday

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    });

    const { POST } = await import('@/app/api/cron/waitlist-invites/route');
    const request = new NextRequest(
      'http://localhost/api/cron/waitlist-invites',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret' },
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.skipped).toBe('outside_send_window');

    vi.useRealTimers();
  });

  it('processes pending invites successfully', async () => {
    // Mock a weekday within business hours
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-08T12:00:00-08:00')); // Monday noon PT

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ claimToken: 'token123' }]),
        }),
      }),
    });

    mockDbTransaction.mockImplementation(async callback => {
      return callback({
        execute: vi.fn().mockResolvedValue({ rows: [] }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      });
    });

    mockSendNotification.mockResolvedValue({ errors: [] });

    const { POST } = await import('@/app/api/cron/waitlist-invites/route');
    const request = new NextRequest(
      'http://localhost/api/cron/waitlist-invites',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret' },
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);

    vi.useRealTimers();
  });
});

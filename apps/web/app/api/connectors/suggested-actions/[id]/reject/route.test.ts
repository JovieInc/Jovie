import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  currentStatus: 'rejected' as string | null,
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn(async () => []) })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () =>
            hoisted.currentStatus ? [{ status: hoisted.currentStatus }] : []
          ),
        })),
      })),
    })),
  },
}));

vi.mock('@/lib/connectors/inbox-decision', () => ({
  recordInboxDecision: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

const { POST } = await import('./route');
const params = { params: Promise.resolve({ id: 'action-1' }) };

describe('suggested action rejection idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.currentStatus = 'rejected';
    hoisted.requireAuth.mockResolvedValue({ userId: 'user-1', error: null });
  });

  it('returns success when the same rejection is retried for receipt reconciliation', async () => {
    const response = await POST(
      new Request(
        'https://jov.ie/api/connectors/suggested-actions/action-1/reject',
        { method: 'POST' }
      ),
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      approvalId: 'action-1',
      status: 'already-rejected',
    });
  });

  it('keeps an opposite prior decision as a conflict', async () => {
    hoisted.currentStatus = 'approved';

    const response = await POST(
      new Request(
        'https://jov.ie/api/connectors/suggested-actions/action-1/reject',
        { method: 'POST' }
      ),
      params
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'already-decided' });
  });
});

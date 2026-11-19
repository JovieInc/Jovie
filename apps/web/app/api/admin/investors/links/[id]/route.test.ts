import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  updateReturningMock: vi.fn(),
}));

vi.mock('@/lib/admin/middleware', () => ({
  requireAdmin: hoisted.requireAdmin,
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: hoisted.updateReturningMock,
        })),
      })),
    })),
  },
}));

vi.mock('@/lib/db/schema/investors', () => ({
  investorLinks: { id: 'id' },
  investorStageEnum: {
    enumValues: [
      'shared',
      'viewed',
      'engaged',
      'meeting_booked',
      'committed',
      'wired',
      'passed',
      'declined',
    ],
  },
}));

const { PATCH } = await import('./route');

const url = 'https://jov.ie/api/admin/investors/links/link_1';

function patch(body: unknown) {
  return PATCH(
    new Request(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'link_1' }) }
  );
}

describe('PATCH /api/admin/investors/links/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAdmin.mockResolvedValue(null);
    hoisted.updateReturningMock.mockResolvedValue([
      { id: 'link_1', stage: 'engaged' },
    ]);
  });

  it('updates an investor link with a valid payload', async () => {
    const response = await patch({ stage: 'engaged', notes: 'warm intro' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.link.id).toBe('link_1');
  });

  it('keeps the legacy expiresAt validation', async () => {
    const response = await patch({ expiresAt: null });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Claim links must expire',
    });
  });

  it('returns 400 for malformed payloads', async () => {
    for (const body of [
      { stage: 'not-a-stage' },
      { isActive: 'yes' },
      { label: 42 },
      'not-an-object',
    ]) {
      const response = await patch(body);
      expect(response.status).toBe(400);
      const parsed = await response.json();
      expect(parsed.error).toBe('Invalid request body');
    }
  });
});

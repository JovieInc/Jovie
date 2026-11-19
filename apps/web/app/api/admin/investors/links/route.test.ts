import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  insertReturningMock: vi.fn(),
}));

vi.mock('@/lib/admin/middleware', () => ({
  requireAdmin: hoisted.requireAdmin,
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: hoisted.insertReturningMock,
      })),
    })),
  },
}));

vi.mock('@/lib/db/schema/investors', () => ({
  investorLinks: { createdAt: 'createdAt' },
}));

vi.mock('@/lib/investors/claim-token', () => ({
  generateInvestorClaimToken: vi.fn(() => 'tok_123'),
  investorClaimExpiresAt: vi.fn(() => new Date('2030-01-01T00:00:00Z')),
}));

const { POST } = await import('./route');

const url = 'https://jov.ie/api/admin/investors/links';

function post(body: unknown) {
  return POST(
    new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/admin/investors/links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAdmin.mockResolvedValue(null);
    hoisted.insertReturningMock.mockResolvedValue([
      { id: 'link_1', label: 'Seed', token: 'tok_123' },
    ]);
  });

  it('creates an investor link with a valid payload', async () => {
    const response = await post({ label: 'Seed', investorName: 'Ada' });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.link.label).toBe('Seed');
  });

  it('returns 400 for malformed payloads', async () => {
    for (const body of [{ label: 42 }, { label: '   ' }, {}, 'not-an-object']) {
      const response = await post(body);
      expect(response.status).toBe(400);
      const parsed = await response.json();
      expect(parsed.error).toBe('Invalid request body');
    }
  });
});

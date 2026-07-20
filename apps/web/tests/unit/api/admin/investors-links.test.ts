import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockDesc = vi.hoisted(() => vi.fn(() => 'desc-clause'));

const { mockDb, mockInsert, mockValues, mockReturning } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockValues = vi.fn(() => ({ returning: mockReturning }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));

  const mockOrderBy = vi.fn();
  const mockFrom = vi.fn(() => ({ orderBy: mockOrderBy }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  return {
    mockDb: { insert: mockInsert, select: mockSelect },
    mockInsert,
    mockValues,
    mockReturning,
  };
});

vi.mock('@/lib/admin/middleware', () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/db/schema/investors', () => ({
  investorLinks: {
    id: 'investor_links.id',
    token: 'investor_links.token',
    label: 'investor_links.label',
    investorName: 'investor_links.investor_name',
    email: 'investor_links.email',
    createdAt: 'investor_links.created_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  desc: mockDesc,
}));

import { POST } from '@/app/api/admin/investors/links/route';

function postRequest(body: unknown) {
  return new Request('http://localhost/api/admin/investors/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/investors/links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null); // authorized by default
    mockReturning.mockResolvedValue([
      {
        id: 'link-1',
        token: 'placeholder-token',
        label: 'Acme Ventures',
        investorName: null,
        email: null,
      },
    ]);
  });

  it('rejects the request before touching the database when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const res = await POST(postRequest({ label: 'Acme Ventures' }));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe('Forbidden');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects a missing label with 400 and does not insert', async () => {
    const res = await POST(postRequest({ investorName: 'Jane' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('Label is required');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects a non-string label with 400 and does not insert', async () => {
    const res = await POST(postRequest({ label: 42 }));

    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only label with 400 and does not insert', async () => {
    const res = await POST(postRequest({ label: '   ' }));

    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('generates a non-trivial token, trims the label, and nulls empty optional fields', async () => {
    const res = await POST(
      postRequest({
        label: '  Acme Ventures  ',
        investorName: '   ',
        email: '',
      })
    );

    expect(res.status).toBe(201);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledTimes(1);

    const insertPayload = mockValues.mock.calls[0][0];

    // Token must be present, non-trivial, and URL-safe (base-36 alphabet).
    expect(typeof insertPayload.token).toBe('string');
    expect(insertPayload.token.length).toBeGreaterThan(0);
    expect(insertPayload.token).toMatch(/^[0-9a-z]+$/);

    expect(insertPayload.label).toBe('Acme Ventures'); // trimmed
    expect(insertPayload.investorName).toBeNull(); // whitespace-only -> null
    expect(insertPayload.email).toBeNull(); // empty string -> null
  });

  it('preserves a real investorName/email instead of nulling them', async () => {
    await POST(
      postRequest({
        label: 'Acme Ventures',
        investorName: '  Jane Doe  ',
        email: '  jane@example.com  ',
      })
    );

    const insertPayload = mockValues.mock.calls[0][0];

    expect(insertPayload.investorName).toBe('Jane Doe');
    expect(insertPayload.email).toBe('jane@example.com');
  });

  it('generates a different token on each call (not a hardcoded/predictable value)', async () => {
    await POST(postRequest({ label: 'Acme Ventures' }));
    const firstToken = mockValues.mock.calls[0][0].token;

    await POST(postRequest({ label: 'Acme Ventures' }));
    const secondToken = mockValues.mock.calls[1][0].token;

    expect(firstToken).not.toBe(secondToken);
  });

  it('returns the inserted row from .returning() as { link } with 201', async () => {
    const insertedRow = {
      id: 'link-42',
      token: 'abc123',
      label: 'Acme Ventures',
      investorName: null,
      email: null,
    };
    mockReturning.mockResolvedValue([insertedRow]);

    const res = await POST(postRequest({ label: 'Acme Ventures' }));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data).toEqual({ link: insertedRow });
  });
});

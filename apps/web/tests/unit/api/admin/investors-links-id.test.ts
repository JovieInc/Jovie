import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn(() => 'eq-clause'));

const { mockDb, mockUpdate, mockSet, mockReturning, mockDelete } = vi.hoisted(
  () => {
    const mockReturning = vi.fn();
    const mockWhere = vi.fn(() => ({ returning: mockReturning }));
    const mockSet = vi.fn(() => ({ where: mockWhere }));
    const mockUpdate = vi.fn(() => ({ set: mockSet }));
    // Tracked separately so a test can assert DELETE never calls a hard
    // row-delete method (the route only ever calls db.update()).
    const mockDelete = vi.fn();

    return {
      mockDb: { update: mockUpdate, delete: mockDelete },
      mockUpdate,
      mockSet,
      mockReturning,
      mockDelete,
    };
  }
);

vi.mock('@/lib/admin/middleware', () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/db/schema/investors', () => ({
  investorLinks: {
    id: 'investor_links.id',
    label: 'investor_links.label',
    investorName: 'investor_links.investor_name',
    email: 'investor_links.email',
    stage: 'investor_links.stage',
    notes: 'investor_links.notes',
    isActive: 'investor_links.is_active',
    expiresAt: 'investor_links.expires_at',
    token: 'investor_links.token',
    updatedAt: 'investor_links.updated_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
}));

import { DELETE, PATCH } from '@/app/api/admin/investors/links/[id]/route';

function patchRequest(body: unknown) {
  return new Request('http://localhost/api/admin/investors/links/link-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/investors/links/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null); // authorized by default
    mockReturning.mockResolvedValue([
      { id: 'link-1', label: 'Updated Label', stage: 'engaged' },
    ]);
  });

  it('rejects the request before touching the database when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const res = await PATCH(
      patchRequest({ label: 'New Label' }),
      paramsFor('link-1')
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe('Forbidden');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('passes allowlisted fields through to the update payload', async () => {
    const expiresAt = '2027-01-01T00:00:00.000Z';

    await PATCH(
      patchRequest({
        label: 'New Label',
        investorName: 'Jane Doe',
        email: 'jane@example.com',
        stage: 'engaged',
        notes: 'Follow up next week',
        isActive: false,
        expiresAt,
      }),
      paramsFor('link-1')
    );

    expect(mockSet).toHaveBeenCalledTimes(1);
    const updatePayload = mockSet.mock.calls[0][0];

    expect(updatePayload).toMatchObject({
      label: 'New Label',
      investorName: 'Jane Doe',
      email: 'jane@example.com',
      stage: 'engaged',
      notes: 'Follow up next week',
      isActive: false,
    });
    expect(updatePayload.expiresAt).toEqual(new Date(expiresAt));
    expect(updatePayload.updatedAt).toBeInstanceOf(Date);
    expect(mockEq).toHaveBeenCalledWith('investor_links.id', 'link-1');
  });

  it('allows clearing expiresAt with null', async () => {
    await PATCH(patchRequest({ expiresAt: null }), paramsFor('link-1'));

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: null })
    );
  });

  it.each([
    'not-a-date',
    123,
  ])('rejects invalid expiresAt %j before touching the database', async expiresAt => {
    const res = await PATCH(patchRequest({ expiresAt }), paramsFor('link-1'));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'expiresAt must be a valid date',
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('ignores a `token` field in the body — it is not in the update payload', async () => {
    await PATCH(
      patchRequest({
        label: 'New Label',
        token: 'attacker-supplied-token',
      }),
      paramsFor('link-1')
    );

    const updatePayload = mockSet.mock.calls[0][0];

    expect(updatePayload).not.toHaveProperty('token');
    expect(Object.keys(updatePayload).sort()).toEqual(
      ['label', 'updatedAt'].sort()
    );
  });

  it('ignores any other unlisted field in the body', async () => {
    await PATCH(
      patchRequest({
        label: 'New Label',
        id: 'attacker-supplied-id',
        engagementScore: 999999,
        createdAt: '2000-01-01T00:00:00.000Z',
      }),
      paramsFor('link-1')
    );

    const updatePayload = mockSet.mock.calls[0][0];

    expect(updatePayload).not.toHaveProperty('id');
    expect(updatePayload).not.toHaveProperty('engagementScore');
    expect(updatePayload).not.toHaveProperty('createdAt');
    expect(Object.keys(updatePayload).sort()).toEqual(
      ['label', 'updatedAt'].sort()
    );
  });

  it('only writes updatedAt when the body has no allowlisted fields', async () => {
    await PATCH(patchRequest({ token: 'nope' }), paramsFor('link-1'));

    const updatePayload = mockSet.mock.calls[0][0];
    expect(Object.keys(updatePayload)).toEqual(['updatedAt']);
  });

  it('returns 404 when the link id does not exist and does not leak an update body', async () => {
    mockReturning.mockResolvedValue([]);

    const res = await PATCH(
      patchRequest({ label: 'New Label' }),
      paramsFor('missing-id')
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe('Link not found');
  });

  it('returns the updated row as { link } with 200 on success', async () => {
    const updatedRow = { id: 'link-1', label: 'New Label', stage: 'engaged' };
    mockReturning.mockResolvedValue([updatedRow]);

    const res = await PATCH(
      patchRequest({ label: 'New Label' }),
      paramsFor('link-1')
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ link: updatedRow });
  });
});

describe('DELETE /api/admin/investors/links/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null); // authorized by default
    mockReturning.mockResolvedValue([
      { id: 'link-1', isActive: false, label: 'Acme Ventures' },
    ]);
  });

  it('rejects the request before touching the database when not admin', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const res = await DELETE(
      new Request('http://localhost/api/admin/investors/links/link-1', {
        method: 'DELETE',
      }),
      paramsFor('link-1')
    );

    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('soft-deletes via db.update({ isActive: false }) — never a hard db.delete()', async () => {
    await DELETE(
      new Request('http://localhost/api/admin/investors/links/link-1', {
        method: 'DELETE',
      }),
      paramsFor('link-1')
    );

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockDelete).not.toHaveBeenCalled();

    const updatePayload = mockSet.mock.calls[0][0];
    expect(updatePayload.isActive).toBe(false);
    expect(updatePayload.updatedAt).toBeInstanceOf(Date);
    // Exactly these two keys — no accidental extra field wipe.
    expect(Object.keys(updatePayload).sort()).toEqual(
      ['isActive', 'updatedAt'].sort()
    );
  });

  it('scopes the update to the requested id via eq()', async () => {
    await DELETE(
      new Request('http://localhost/api/admin/investors/links/link-1', {
        method: 'DELETE',
      }),
      paramsFor('link-1')
    );

    expect(mockEq).toHaveBeenCalledWith('investor_links.id', 'link-1');
  });

  it('returns 404 when the link id does not exist', async () => {
    mockReturning.mockResolvedValue([]);

    const res = await DELETE(
      new Request('http://localhost/api/admin/investors/links/missing-id', {
        method: 'DELETE',
      }),
      paramsFor('missing-id')
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe('Link not found');
  });

  it('returns the deactivated row as { link } with 200 on success', async () => {
    const deactivatedRow = { id: 'link-1', isActive: false };
    mockReturning.mockResolvedValue([deactivatedRow]);

    const res = await DELETE(
      new Request('http://localhost/api/admin/investors/links/link-1', {
        method: 'DELETE',
      }),
      paramsFor('link-1')
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ link: deactivatedRow });
  });
});

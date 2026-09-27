import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockExecute = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mockGetCachedAuth }));
vi.mock('@/lib/db', () => ({ db: { execute: mockExecute } }));

import { POST } from './route';

function request(acquisitionId = '7f5bb735-8e88-4d78-ae32-5228cc12a8bb') {
  return new NextRequest('http://localhost/api/acquisition', {
    method: 'POST',
    body: JSON.stringify({
      acquisitionId,
      capturedAt: '2026-09-20T00:00:00.000Z',
      firstTouch: { source: 'organic', campaign: 'release' },
    }),
  });
}

describe('POST /api/acquisition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ rows: [] });
  });

  it('records and links only the exact acquisition id for an authenticated user', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'ba-user-1' });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recorded: true, linked: true });
    expect(mockExecute).toHaveBeenCalledOnce();
    const query = mockExecute.mock.calls[0][0];
    const sqlText = JSON.stringify(query);
    expect(sqlText).toContain('pe.acquisition_id = claimed.id');
    expect(sqlText).toContain('pe.user_id IS NULL');
  });

  it('rejects malformed ids without writing', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });
    expect((await POST(request('not-an-id'))).status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

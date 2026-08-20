import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminHudApiAccessMock = vi.fn();

vi.mock('@/lib/hud/require-admin-hud-api', () => ({
  requireAdminHudApiAccess: requireAdminHudApiAccessMock,
}));

describe('POST /api/hud/founder-walks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for non-admin callers', async () => {
    requireAdminHudApiAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const { POST } = await import('@/app/api/hud/founder-walks/route');
    const response = await POST(
      new NextRequest('http://localhost/api/hud/founder-walks', {
        method: 'POST',
        body: JSON.stringify({
          blobUrl: 'https://abc.blob.vercel-storage.com/walk.webm',
          durationMs: 1000,
          byteSize: 12,
        }),
      })
    );

    expect(response.status).toBe(403);
  });

  it('rejects a non-account blob URL', async () => {
    requireAdminHudApiAccessMock.mockResolvedValue(null);

    const { POST } = await import('@/app/api/hud/founder-walks/route');
    const response = await POST(
      new NextRequest('http://localhost/api/hud/founder-walks', {
        method: 'POST',
        body: JSON.stringify({
          blobUrl: 'https://example.com/walk.webm',
          durationMs: 1000,
          byteSize: 12,
        }),
      })
    );

    expect(response.status).toBe(400);
  });

  it('confirms an uploaded walk without admitting work', async () => {
    requireAdminHudApiAccessMock.mockResolvedValue(null);

    const { POST } = await import('@/app/api/hud/founder-walks/route');
    const response = await POST(
      new NextRequest('http://localhost/api/hud/founder-walks', {
        method: 'POST',
        body: JSON.stringify({
          blobUrl: 'https://abc.blob.vercel-storage.com/walk.webm',
          durationMs: 12000,
          byteSize: 2048,
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.admitted).toBe(false);
    expect(body.status).toBe('uploaded');
  });
});

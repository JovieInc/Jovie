import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/admin/middleware', () => ({
  requireAdmin: mocks.requireAdmin,
}));

import { NextResponse } from 'next/server';
import { GET, POST } from './route';

describe('/api/admin/visibility-audit', () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
  });

  it('rejects callers who are not admins', async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );
    const response = await GET(
      new Request('https://jov.ie/api/admin/visibility-audit')
    );
    expect(response.status).toBe(403);
  });

  it('returns the Tim sample markdown for an admin', async () => {
    mocks.requireAdmin.mockResolvedValue(null);
    const response = await GET(
      new Request('https://jov.ie/api/admin/visibility-audit?format=markdown')
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('Digital Footprint & Visibility Audit');
    expect(body).toContain('https://jov.ie/tim');
    expect(body).toContain('SerpAPI requests: 0');
  });

  it('rejects a snapshot that is not an audit input', async () => {
    mocks.requireAdmin.mockResolvedValue(null);
    const response = await POST(
      new Request('https://jov.ie/api/admin/visibility-audit', {
        method: 'POST',
        body: JSON.stringify({ artistName: '' }),
        headers: { 'content-type': 'application/json' },
      })
    );
    expect(response.status).toBe(400);
  });
});

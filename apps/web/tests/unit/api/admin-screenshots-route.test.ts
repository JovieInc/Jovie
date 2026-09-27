import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  resolveScreenshotPath: vi.fn(),
}));

vi.mock('@/lib/admin/middleware', () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock('@/lib/admin/screenshots', () => ({
  resolveScreenshotPath: mocks.resolveScreenshotPath,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

import { GET } from '@/app/api/admin/screenshots/[filename]/route';

describe('admin screenshot asset route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.resolveScreenshotPath.mockReturnValue(
      join(process.cwd(), 'package.json')
    );
  });

  it('uses the role-gated admin read boundary and serves the image', async () => {
    const response = await GET(new Request('http://localhost/api') as never, {
      params: Promise.resolve({ filename: 'canonical' }),
    });

    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(mocks.resolveScreenshotPath).toHaveBeenCalledWith('canonical');
  });

  it('returns the admin authorization response before touching the filesystem', async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const response = await GET(new Request('http://localhost/api') as never, {
      params: Promise.resolve({ filename: 'canonical' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.resolveScreenshotPath).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/images/sign-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 404 since Cloudinary is disabled', async () => {
    const { POST } = await import('@/app/api/images/sign-upload/route');
    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Cloudinary not enabled');
  });
});

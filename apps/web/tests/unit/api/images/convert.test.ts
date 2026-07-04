import { describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/images/convert/route';
import { malformedMultipartRequest } from '@/tests/helpers/malformed-multipart-request';

const mockAuth = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

describe('/api/images/convert', () => {
  it('rejects malformed multipart bodies as a client error', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const response = await POST(
      malformedMultipartRequest('/api/images/convert')
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid form data. Please try converting again.',
      code: 'INVALID_CONTENT_TYPE',
    });
  });
});

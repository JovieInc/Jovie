import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@vercel/blob', () => ({
  put: vi.fn().mockResolvedValue({
    url: 'https://blob.vercel-storage.com/image.jpg',
  }),
}));

describe('POST /api/images/sign-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { POST } = await import('@/app/api/images/sign-upload/route');
    const request = new NextRequest('http://localhost/api/images/sign-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'test.jpg', contentType: 'image/jpeg' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns signed upload URL for authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    const { POST } = await import('@/app/api/images/sign-upload/route');
    const request = new NextRequest('http://localhost/api/images/sign-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.uploadUrl).toBeDefined();
  });

  it('returns 400 for invalid content type', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    const { POST } = await import('@/app/api/images/sign-upload/route');
    const request = new NextRequest('http://localhost/api/images/sign-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'test.exe',
        contentType: 'application/octet-stream',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('type');
  });
});

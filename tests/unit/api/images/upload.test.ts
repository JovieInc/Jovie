import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/images/upload/route';

// Hoist mocks before they're used
const { mockAuth, mockInsert, mockUpdate, mockEq } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
}));

// Mock dependencies
vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
  },
  profilePhotos: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
}));

vi.mock('@/lib/rate-limit', () => ({
  avatarUploadRateLimit: null, // Disabled in tests
}));

describe('/api/images/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 'test-photo-id',
            userId: 'test-user-id',
            status: 'uploading',
            originalFilename: 'test.jpg',
            mimeType: 'image/jpeg',
            fileSize: 1024,
          },
        ]),
      }),
    });

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  it('should reject requests without authentication', async () => {
    // Mock no user
    mockAuth.mockResolvedValue({ userId: null });

    const request = new NextRequest('http://localhost:3000/api/images/upload', {
      method: 'POST',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('should reject requests without files', async () => {
    // Mock authenticated user
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    // Create form data without file
    const formData = new FormData();

    const request = new NextRequest('http://localhost:3000/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe('No file provided');
  });

  it('should reject non-image files', async () => {
    // Mock authenticated user
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    // Create form data with non-image file
    const formData = new FormData();
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    formData.append('file', file);

    const request = new NextRequest('http://localhost:3000/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe('Invalid file');
  });

  it('should reject files larger than 4MB', async () => {
    // Mock authenticated user
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    // Create large file (5MB)
    const largeContent = new Array(5 * 1024 * 1024).fill('a').join('');
    const formData = new FormData();
    const file = new File([largeContent], 'large.jpg', { type: 'image/jpeg' });
    formData.append('file', file);

    const request = new NextRequest('http://localhost:3000/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe('File too large. Maximum 4MB allowed.');
  });

  it('should successfully process valid image upload', async () => {
    // Mock authenticated user
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    // Create valid image file
    const formData = new FormData();
    const file = new File(['fake-image-data'], 'test.jpg', {
      type: 'image/jpeg',
    });
    formData.append('file', file);

    const request = new NextRequest('http://localhost:3000/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data).toHaveProperty('id', 'test-photo-id');
    expect(data).toHaveProperty('status', 'processing');
    expect(data).toHaveProperty('blobUrl');
  });

  it('should accept JPEG images', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = new File(['fake-jpeg'], 'test.jpeg', { type: 'image/jpeg' });
    formData.append('file', file);

    const request = new NextRequest('http://localhost:3000/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
  });

  it('should accept PNG images', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = new File(['fake-png'], 'test.png', { type: 'image/png' });
    formData.append('file', file);

    const request = new NextRequest('http://localhost:3000/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
  });

  it('should accept WebP images', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = new File(['fake-webp'], 'test.webp', { type: 'image/webp' });
    formData.append('file', file);

    const request = new NextRequest('http://localhost:3000/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
  });
});

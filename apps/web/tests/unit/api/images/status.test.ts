import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/images/status/[id]/route';

// Hoisted mocks so they can be shared between vi.mock and tests
const { auth, mockEq, mockAnd, mockGetUserByClerkId } = vi.hoisted(() => ({
  auth: vi.fn(),
  mockEq: vi.fn(),
  mockAnd: vi.fn(),
  mockGetUserByClerkId: vi.fn(),
}));

const { db } = vi.hoisted(() => {
  const limit = vi.fn();
  const whereResult = { limit };
  const where = vi.fn(() => whereResult);
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ where, innerJoin }));
  const select = vi.fn(() => ({ from }));

  return {
    db: {
      select,
    },
  };
});

// Module mocks use the same hoisted instances the tests manipulate
vi.mock('@clerk/nextjs/server', () => ({
  auth,
}));

vi.mock('@/lib/db', () => ({
  db,
  eq: mockEq,
  and: mockAnd,
  profilePhotos: {
    id: 'id',
    userId: 'user_id',
  },
  users: {
    id: 'id',
    clerkId: 'clerk_id',
  },
}));

vi.mock('@/lib/db/queries/shared', () => ({
  getUserByClerkId: mockGetUserByClerkId,
}));

// Valid UUID v4 for tests
const TEST_PHOTO_UUID = '550e8400-e29b-41d4-a716-446655440000';
const NON_EXISTENT_UUID = '550e8400-e29b-41d4-a716-446655440001';

describe('/api/images/status/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserByClerkId.mockResolvedValue({ id: 'internal-user-id' });
  });

  it('should reject requests without authentication', async () => {
    auth.mockResolvedValue({ userId: null });

    const request = new NextRequest(
      `http://localhost:3000/api/images/status/${TEST_PHOTO_UUID}`
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: TEST_PHOTO_UUID }),
    });

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 404 for non-existent photo', async () => {
    auth.mockResolvedValue({ userId: 'test-user-id' });

    // Mock empty result
    db.select().from().where().limit.mockResolvedValue([]);

    const request = new NextRequest(
      `http://localhost:3000/api/images/status/${NON_EXISTENT_UUID}`
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: NON_EXISTENT_UUID }),
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Photo not found');
  });

  it('should return photo status for valid request', async () => {
    auth.mockResolvedValue({ userId: 'test-user-id' });

    const mockPhoto = {
      id: TEST_PHOTO_UUID,
      status: 'ready',
      blobUrl: 'https://blob.vercel-storage.com/test.jpg',
      smallUrl: 'https://blob.vercel-storage.com/test-small.jpg',
      mediumUrl: 'https://blob.vercel-storage.com/test-medium.jpg',
      largeUrl: 'https://blob.vercel-storage.com/test-large.jpg',
      processedAt: new Date(),
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    db.select().from().where().limit.mockResolvedValue([mockPhoto]);

    const request = new NextRequest(
      `http://localhost:3000/api/images/status/${TEST_PHOTO_UUID}`
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: TEST_PHOTO_UUID }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.jobId).toBe(TEST_PHOTO_UUID);
    expect(data.status).toBe('ready');
    expect(data.formats.webp.original).toBe(mockPhoto.blobUrl);
    expect(data.formats.webp.medium).toBe(mockPhoto.mediumUrl);
  });

  it('should handle processing status', async () => {
    auth.mockResolvedValue({ userId: 'test-user-id' });

    const mockPhoto = {
      id: TEST_PHOTO_UUID,
      status: 'processing',
      blobUrl: 'https://blob.vercel-storage.com/test.jpg',
      smallUrl: null,
      mediumUrl: null,
      largeUrl: null,
      processedAt: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    db.select().from().where().limit.mockResolvedValue([mockPhoto]);

    const request = new NextRequest(
      `http://localhost:3000/api/images/status/${TEST_PHOTO_UUID}`
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: TEST_PHOTO_UUID }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('processing');
    expect(data.processedAt).toBeNull();
  });

  it('should handle failed status with error message', async () => {
    auth.mockResolvedValue({ userId: 'test-user-id' });

    const mockPhoto = {
      id: TEST_PHOTO_UUID,
      status: 'failed',
      blobUrl: 'https://blob.vercel-storage.com/test.jpg',
      smallUrl: null,
      mediumUrl: null,
      largeUrl: null,
      processedAt: null,
      errorMessage: 'Processing failed due to invalid image format',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    db.select().from().where().limit.mockResolvedValue([mockPhoto]);

    const request = new NextRequest(
      `http://localhost:3000/api/images/status/${TEST_PHOTO_UUID}`
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: TEST_PHOTO_UUID }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('failed');
    expect(data.errorMessage).toBe(
      'Processing failed due to invalid image format'
    );
  });
});

import { Buffer } from 'node:buffer';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/images/upload/route';

// Hoist mocks before they're used
const {
  mockAuth,
  mockInsert,
  mockUpdate,
  mockEq,
  sharpMock,
  sharpMetadataMock,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
  sharpMock: vi.fn(),
  sharpMetadataMock: vi.fn(),
}));

// Mock dependencies
vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSession: async (
    operation: (userId: string) => Promise<unknown>
  ): Promise<unknown> => {
    const { userId } = await mockAuth();
    if (!userId) {
      throw new Error('Unauthorized');
    }
    return operation(userId);
  },
}));

vi.mock('@/lib/db', () => {
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ id: 'internal-user-id' }]),
      }),
    }),
  });

  return {
    db: {
      select,
      insert: mockInsert,
      update: mockUpdate,
    },
    profilePhotos: {
      id: 'id',
      userId: 'user_id',
    },
    users: {
      id: 'id',
      clerkId: 'clerk_id',
    },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
}));

vi.mock('@/lib/rate-limit', () => ({
  avatarUploadRateLimit: null, // Disabled in tests
}));

vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (path: string) => ({
    url: `https://blob.vercel-storage.com/${path}`,
    pathname: path,
    contentType: 'image/webp',
    size: 1234,
  })),
}));

vi.mock('sharp', () => {
  const createPipeline = () => {
    const pipeline = {
      clone: vi.fn(),
      resize: vi.fn(),
      webp: vi.fn(),
      toBuffer: vi.fn(),
      metadata: sharpMetadataMock,
      rotate: vi.fn(),
    };

    pipeline.clone.mockImplementation(createPipeline);
    pipeline.resize.mockReturnValue(pipeline);
    pipeline.webp.mockReturnValue(pipeline);
    pipeline.rotate.mockReturnValue(pipeline);
    pipeline.toBuffer.mockImplementation(
      async (options?: { resolveWithObject?: boolean }) => {
        if (options && 'resolveWithObject' in options) {
          return {
            data: Buffer.from('optimized-original'),
            info: { size: 1024, width: 800, height: 800 },
          };
        }
        return Buffer.from('optimized-variant');
      }
    );

    return pipeline;
  };

  const pipeline = createPipeline();
  sharpMock.mockImplementation(() => pipeline);

  return {
    __esModule: true,
    default: (...args: unknown[]) => sharpMock(...args),
  };
});

function createMultipartRequest(formData: FormData): NextRequest {
  const request = new NextRequest('http://localhost:3000/api/images/upload', {
    method: 'POST',
  });

  // Explicitly mock formData resolution instead of relying on NextRequest's
  // internal body handling in the Vitest environment.
  const requestWithFormData = request as NextRequest & {
    formData: () => Promise<FormData>;
  };
  requestWithFormData.formData = async () => formData;

  request.headers.set(
    'content-type',
    'multipart/form-data; boundary=----vitest-test-boundary'
  );

  return request;
}

describe('/api/images/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharpMetadataMock.mockResolvedValue({ width: 800, height: 800 });

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

    const request = createMultipartRequest(formData);

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

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe('Invalid file');
  });

  it('should reject files larger than 4MB', async () => {
    // Mock authenticated user
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = new File(['x'], 'large.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', {
      value: 5 * 1024 * 1024 + 1,
    });
    formData.append('file', file);

    const request = createMultipartRequest(formData);

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

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);

    expect(data).toHaveProperty('id', 'test-photo-id');
    expect(data).toHaveProperty('status', 'completed');
    expect(data).toHaveProperty('blobUrl');
    expect(data).toHaveProperty('smallUrl');
  });

  it('should accept JPEG images', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = new File(['fake-jpeg'], 'test.jpeg', { type: 'image/jpeg' });
    formData.append('file', file);

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    expect(response.status).toBe(201);
  });

  it('should accept PNG images', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = new File(['fake-png'], 'test.png', { type: 'image/png' });
    formData.append('file', file);

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    expect(response.status).toBe(201);
  });

  it('should accept WebP images', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = new File(['fake-webp'], 'test.webp', { type: 'image/webp' });
    formData.append('file', file);

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    expect(response.status).toBe(201);
  });

  it('should accept HEIC images and normalize output', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = new File(['fake-heic'], 'test.heic', { type: 'image/heic' });
    formData.append('file', file);

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.blobUrl).toContain('.webp');
  });
});

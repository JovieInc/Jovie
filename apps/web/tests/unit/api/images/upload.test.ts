import { Buffer } from 'node:buffer';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/images/upload/route';

// Hoist mocks before they're used
const {
  mockAuth,
  mockInsert,
  mockUpdate,
  mockSelect,
  mockEq,
  mockGetUserByClerkId,
  sharpMock,
  sharpMetadataMock,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(() => 'eq-result'),
  mockGetUserByClerkId: vi.fn(),
  sharpMock: vi.fn(),
  sharpMetadataMock: vi.fn(),
}));

// Mock dependencies
vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSession: async (operation: (userId: string) => Promise<unknown>) => {
    const { userId } = await mockAuth();
    if (!userId) throw new Error('Unauthorized');
    return operation(userId);
  },
  withDbSessionTx: async (
    operation: (
      tx: {
        select: typeof mockSelect;
        insert: typeof mockInsert;
        update: typeof mockUpdate;
        execute: typeof mockInsert;
      },
      userId: string
    ) => Promise<unknown>
  ) => {
    const { userId } = await mockAuth();
    if (!userId) throw new Error('Unauthorized');
    const tx = {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      execute: vi.fn(),
    };
    return operation(tx as never, userId);
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  and: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('@/lib/db/queries/shared', () => ({
  getUserByClerkId: mockGetUserByClerkId,
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  profilePhotos: {
    id: 'id',
    userId: 'user_id',
    status: 'status',
    blobUrl: 'blobUrl',
    smallUrl: 'smallUrl',
    mediumUrl: 'mediumUrl',
    largeUrl: 'largeUrl',
    mimeType: 'mimeType',
    fileSize: 'fileSize',
    width: 'width',
    height: 'height',
    processedAt: 'processedAt',
    updatedAt: 'updatedAt',
    originalFilename: 'originalFilename',
  },
  creatorProfiles: {
    id: 'id',
    userId: 'user_id',
    usernameNormalized: 'username_normalized',
  },
}));

// Keep db mock for dynamic import fallback in route
vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}));

vi.mock('@/lib/cache', () => ({
  invalidateAvatarCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/rate-limit', () => ({
  avatarUploadLimiter: {
    limit: vi.fn().mockResolvedValue({
      success: true,
      limit: 3,
      remaining: 2,
      reset: new Date(Date.now() + 60000),
    }),
  },
}));

// Mock magic bytes validation - we test this separately
// In API tests, we want to test the overall flow, not the byte-level validation
const mockValidateMagicBytes = vi.fn();
vi.mock('@/lib/images/validate-magic-bytes', () => ({
  validateMagicBytes: (...args: unknown[]) => mockValidateMagicBytes(...args),
}));

vi.mock('@/lib/images/config', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/images/config')>();
  return {
    ...actual,
    buildSeoFilename: vi.fn(() => 'test-photo.avif'),
  };
});

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
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
      avif: vi.fn(),
      toColourspace: vi.fn(),
      withMetadata: vi.fn(),
      toBuffer: vi.fn(),
      metadata: sharpMetadataMock,
      rotate: vi.fn(),
    };

    pipeline.clone.mockImplementation(createPipeline);
    pipeline.resize.mockReturnValue(pipeline);
    pipeline.avif.mockReturnValue(pipeline);
    pipeline.toColourspace.mockReturnValue(pipeline);
    pipeline.withMetadata.mockReturnValue(pipeline);
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

// Helper to create files with valid magic bytes
const MAGIC_BYTES = {
  jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  webp: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]),
};

function createValidImageFile(
  name: string,
  type: 'image/jpeg' | 'image/png' | 'image/webp',
  size?: number
): File {
  let bytes: Uint8Array;
  if (type === 'image/jpeg') bytes = MAGIC_BYTES.jpeg;
  else if (type === 'image/png') bytes = MAGIC_BYTES.png;
  else bytes = MAGIC_BYTES.webp;

  // Create a Blob first, then File - ensures arrayBuffer() works correctly
  // Cast to BlobPart to satisfy TypeScript's strict ArrayBuffer typing
  const blob = new Blob([bytes as unknown as BlobPart], { type });
  const file = new File([blob], name, { type });
  if (size !== undefined) {
    Object.defineProperty(file, 'size', { value: size });
  }
  return file;
}

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

    // Default authenticated user; individual tests override as needed
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    // Default: magic bytes validation passes for valid image types
    mockValidateMagicBytes.mockReturnValue(true);

    // Default: getUserByClerkId returns a valid user
    mockGetUserByClerkId.mockResolvedValue({
      id: 'internal-user-id',
      clerkId: 'test-user-id',
    });

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

    // Mock select for creatorProfiles query (to get usernameNormalized for cache invalidation)
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ usernameNormalized: 'testuser' }]),
        }),
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
    expect(data.error).toBe('Please sign in to upload a profile photo.');
    expect(data.code).toBe('UNAUTHORIZED');
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
    expect(data.error).toBe(
      'No file provided. Please select an image to upload.'
    );
    expect(data.code).toBe('NO_FILE');
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
    expect(data.error).toContain('Invalid file type');
    expect(data.code).toBe('INVALID_FILE');
  });

  it('should reject files larger than 25MB', async () => {
    // Mock authenticated user
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = createValidImageFile(
      'large.jpg',
      'image/jpeg',
      30 * 1024 * 1024 // 30MB > 25MB limit
    );
    formData.append('file', file);

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe('File too large. Maximum 25MB allowed.');
  });

  it('should successfully process valid image upload', async () => {
    // Mock authenticated user
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    // Create valid image file with proper magic bytes
    const formData = new FormData();
    const file = createValidImageFile('test.jpg', 'image/jpeg');
    formData.append('file', file);

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(202);

    expect(data).toHaveProperty('jobId', 'test-photo-id');
    expect(data).toHaveProperty('status', 'ready');
    expect(data).toHaveProperty('blobUrl');
    expect(data).toHaveProperty('smallUrl');
  });

  it('should accept JPEG images', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = createValidImageFile('test.jpeg', 'image/jpeg');
    formData.append('file', file);

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    expect(response.status).toBe(202);
  });

  it('should accept PNG images', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = createValidImageFile('test.png', 'image/png');
    formData.append('file', file);

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    expect(response.status).toBe(202);
  });

  it('should accept WebP images', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = createValidImageFile('test.webp', 'image/webp');
    formData.append('file', file);

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    expect(response.status).toBe(202);
  });

  it('should accept HEIC images and normalize output', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = new File(['fake-heic'], 'test.heic', { type: 'image/heic' });
    formData.append('file', file);

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    expect(response.status).toBe(202);
    const data = await response.json();
    expect(data.blobUrl).toContain('.avif');
  });

  it('should reject files with spoofed MIME type (magic bytes mismatch)', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    // Mock magic bytes validation to fail (simulating spoofed file)
    mockValidateMagicBytes.mockReturnValue(false);

    // Create a file that claims to be JPEG but has text content (no JPEG magic bytes)
    const formData = new FormData();
    const spoofedFile = new File(['not-a-real-jpeg-file'], 'fake.jpg', {
      type: 'image/jpeg',
    });
    formData.append('file', spoofedFile);

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('does not match declared type');
    expect(data.code).toBe('INVALID_FILE');
  });

  it('should accept files with valid JPEG magic bytes', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = createValidImageFile('valid.jpg', 'image/jpeg');
    formData.append('file', file);

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    // Should pass magic bytes validation and proceed to processing
    expect(response.status).toBe(202);
  });

  it('should accept files with valid PNG magic bytes', async () => {
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });

    const formData = new FormData();
    const file = createValidImageFile('valid.png', 'image/png');
    formData.append('file', file);

    const request = createMultipartRequest(formData);

    const response = await POST(request);
    expect(response.status).toBe(202);
  });
});

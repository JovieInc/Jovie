import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies - hoisted to ensure availability in vi.mock callbacks
const { mockUpdateUser, mockClerkClient } = vi.hoisted(() => {
  const mockUpdateUser = vi.fn();
  return {
    mockUpdateUser,
    mockClerkClient: {
      users: {
        updateUser: mockUpdateUser,
      },
    },
  };
});

const clerkSyncMocks = vi.hoisted(() => ({
  syncAllClerkMetadata: vi.fn().mockResolvedValue({ success: true }),
  syncEmailFromClerkByClerkId: vi.fn().mockResolvedValue({ success: true }),
}));

const mockHeaders = vi.hoisted(() => vi.fn());
const mockWebhookVerify = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(() => Promise.resolve(mockClerkClient)),
}));

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('svix', () => {
  return {
    Webhook: class MockWebhook {
      verify = mockWebhookVerify;
    },
  };
});

vi.mock('@/lib/env', () => ({
  env: new Proxy(
    {},
    {
      get: (_target, prop) =>
        (process.env as Record<string, unknown>)[prop as string],
    }
  ),
}));

vi.mock('@/lib/auth/clerk-sync', () => clerkSyncMocks);

// Helper to create mock headers using real Headers for case-insensitive matching
function createMockHeaders(entries: [string, string][]): Headers {
  return new Headers(entries);
}

// Import after mocks are set up
import { POST } from '@/app/api/clerk/webhook/route';

describe('/api/clerk/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set required environment variable
    process.env.CLERK_WEBHOOK_SECRET = 'test_webhook_secret';

    clerkSyncMocks.syncAllClerkMetadata.mockResolvedValue({ success: true });

    // Mock headers - headers() is async in Next.js 15+
    mockHeaders.mockResolvedValue(
      createMockHeaders([
        ['svix-id', 'svix_123'],
        ['svix-timestamp', '1234567890'],
        ['svix-signature', 'signature_123'],
      ])
    );

    // Reset webhook verification mock completely and set safe default
    mockWebhookVerify.mockReset();
    mockWebhookVerify.mockImplementation(() => {
      throw new Error('Webhook verification not mocked for this test');
    });
  });

  describe('user.created event', () => {
    it('should process user with first and last name', async () => {
      const eventData = {
        data: {
          id: 'user_123',
          email_addresses: [
            {
              email_address: 'test@example.com',
              verification: { status: 'verified' },
            },
          ],
          first_name: 'John',
          last_name: 'Doe',
          private_metadata: {},
          public_metadata: {},
        },
        object: 'event' as const,
        type: 'user.created' as const,
      };

      // Mock webhook verification to return the event data
      mockWebhookVerify.mockReturnValue(eventData);

      // Mock Clerk client
      mockUpdateUser.mockResolvedValue({});

      const request = new NextRequest(
        'http://localhost:3000/api/clerk/webhook',
        {
          method: 'POST',
          body: JSON.stringify(eventData),
        }
      );

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.fullName).toBe('John Doe');

      expect(mockUpdateUser).toHaveBeenCalledWith('user_123', {
        privateMetadata: {
          fullName: 'John Doe',
        },
      });
    });

    it('should process user with only first name', async () => {
      const eventData = {
        data: {
          id: 'user_123',
          email_addresses: [
            {
              email_address: 'test@example.com',
              verification: { status: 'verified' },
            },
          ],
          first_name: 'John',
          last_name: null,
          private_metadata: {},
          public_metadata: {},
        },
        object: 'event' as const,
        type: 'user.created' as const,
      };

      // Mock webhook verification to return the event data
      mockWebhookVerify.mockReturnValue(eventData);

      mockUpdateUser.mockResolvedValue({} as any);

      const request = new NextRequest(
        'http://localhost:3000/api/clerk/webhook',
        {
          method: 'POST',
          body: JSON.stringify(eventData),
        }
      );

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.fullName).toBe('John');
      expect(mockUpdateUser).toHaveBeenCalledWith('user_123', {
        privateMetadata: {
          fullName: 'John',
        },
      });
    });

    it('should process user with no name but email', async () => {
      const eventData = {
        data: {
          id: 'user_123',
          email_addresses: [
            {
              email_address: 'johndoe@example.com',
              verification: { status: 'verified' },
            },
          ],
          first_name: null,
          last_name: null,
          private_metadata: {},
          public_metadata: {},
        },
        object: 'event' as const,
        type: 'user.created' as const,
      };

      // Mock webhook verification to return the event data
      mockWebhookVerify.mockReturnValue(eventData);

      mockUpdateUser.mockResolvedValue({} as any);

      const request = new NextRequest(
        'http://localhost:3000/api/clerk/webhook',
        {
          method: 'POST',
          body: JSON.stringify(eventData),
        }
      );

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.fullName).toBe('');
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('should handle short names by adding random suffix', async () => {
      const eventData = {
        data: {
          id: 'user_123',
          email_addresses: [
            {
              email_address: 'a@example.com',
              verification: { status: 'verified' },
            },
          ],
          first_name: 'Al',
          last_name: null,
          private_metadata: {},
          public_metadata: {},
        },
        object: 'event' as const,
        type: 'user.created' as const,
      };

      // Mock webhook verification to return the event data
      mockWebhookVerify.mockReturnValue(eventData);

      mockUpdateUser.mockResolvedValue({} as any);

      const request = new NextRequest(
        'http://localhost:3000/api/clerk/webhook',
        {
          method: 'POST',
          body: JSON.stringify(eventData),
        }
      );

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.fullName).toBe('Al');
      expect(mockUpdateUser).toHaveBeenCalledWith('user_123', {
        privateMetadata: {
          fullName: 'Al',
        },
      });
    });
  });

  describe('webhook security', () => {
    it('should reject requests with missing headers', async () => {
      mockHeaders.mockResolvedValue(createMockHeaders([]));

      const request = new NextRequest(
        'http://localhost:3000/api/clerk/webhook',
        {
          method: 'POST',
          body: 'test',
        }
      );

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Missing svix headers');
    });

    it('should reject requests with invalid signature', async () => {
      // Use the shared mockWebhook instance
      mockWebhookVerify.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const request = new NextRequest(
        'http://localhost:3000/api/clerk/webhook',
        {
          method: 'POST',
          body: 'test',
        }
      );

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Invalid signature');
    });

    it('should return error when webhook secret is missing', async () => {
      // Re-import route after clearing the env so env-server sees it missing
      delete process.env.CLERK_WEBHOOK_SECRET;

      const request = new NextRequest(
        'http://localhost:3000/api/clerk/webhook',
        {
          method: 'POST',
          body: 'test',
        }
      );

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result.error).toBe('Webhook secret not configured');
    });
  });

  describe('other event types', () => {
    it('should acknowledge other event types', async () => {
      const eventData = {
        data: {},
        object: 'event' as const,
        type: 'session.created' as const,
      };

      // Mock webhook verification to return the event data
      mockWebhookVerify.mockReturnValue(eventData);

      const request = new NextRequest(
        'http://localhost:3000/api/clerk/webhook',
        {
          method: 'POST',
          body: JSON.stringify(eventData),
        }
      );

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.type).toBe('session.created');
    });
  });

  describe('user.updated email sync', () => {
    it('should sync verified primary email and return success', async () => {
      const eventData = {
        data: {
          id: 'user_123',
          primary_email_address_id: 'email_1',
          email_addresses: [
            {
              id: 'email_1',
              email_address: 'new@example.com',
              verification: { status: 'verified' },
            },
          ],
          first_name: null,
          last_name: null,
          private_metadata: {},
          public_metadata: {},
        },
        object: 'event' as const,
        type: 'user.updated' as const,
      };

      mockWebhookVerify.mockReturnValue(eventData);
      clerkSyncMocks.syncEmailFromClerkByClerkId.mockResolvedValue({
        success: true,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/clerk/webhook',
        {
          method: 'POST',
          body: JSON.stringify(eventData),
        }
      );

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.type).toBe('user.updated');
      expect(clerkSyncMocks.syncEmailFromClerkByClerkId).toHaveBeenCalledWith(
        'user_123',
        'new@example.com'
      );
    });

    it('should handle email sync errors gracefully', async () => {
      const eventData = {
        data: {
          id: 'user_123',
          primary_email_address_id: 'email_1',
          email_addresses: [
            {
              id: 'email_1',
              email_address: 'new@example.com',
              verification: { status: 'verified' },
            },
          ],
          first_name: null,
          last_name: null,
          private_metadata: {},
          public_metadata: {},
        },
        object: 'event' as const,
        type: 'user.updated' as const,
      };

      mockWebhookVerify.mockReturnValue(eventData);
      clerkSyncMocks.syncEmailFromClerkByClerkId.mockResolvedValue({
        success: false,
        error: 'sync-failed',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/clerk/webhook',
        {
          method: 'POST',
          body: JSON.stringify(eventData),
        }
      );

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to sync email from Clerk');
      expect(clerkSyncMocks.syncEmailFromClerkByClerkId).toHaveBeenCalledWith(
        'user_123',
        'new@example.com'
      );
    });
  });

  describe('error handling', () => {
    it('should handle Clerk API errors gracefully', async () => {
      const eventData = {
        data: {
          id: 'user_123',
          email_addresses: [
            {
              email_address: 'test@example.com',
              verification: { status: 'verified' },
            },
          ],
          first_name: 'John',
          last_name: 'Doe',
          private_metadata: {},
          public_metadata: {},
        },
        object: 'event' as const,
        type: 'user.created' as const,
      };

      // Mock webhook verification to return the event data
      mockWebhookVerify.mockReturnValue(eventData);

      // Mock Clerk API error
      mockUpdateUser.mockRejectedValue(new Error('Clerk API error'));

      const request = new NextRequest(
        'http://localhost:3000/api/clerk/webhook',
        {
          method: 'POST',
          body: JSON.stringify(eventData),
        }
      );

      const response = await POST(request);
      const result = await response.json();

      // Should return 200 to prevent retries
      expect(response.status).toBe(200);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to process user data');
    });
  });
});

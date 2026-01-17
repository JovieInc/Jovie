import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/clerk/webhook/route';

// Mock dependencies
const mockUpdateUser = vi.fn();
const mockClerkClient = {
  users: {
    updateUser: mockUpdateUser,
  },
};

const syncMocks = vi.hoisted(() => ({
  syncUsernameFromClerkEvent: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(() => Promise.resolve(mockClerkClient)),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

vi.mock('svix', () => ({
  Webhook: vi.fn(),
}));

vi.mock('@/lib/username/sync', () => syncMocks);

const { headers } = await import('next/headers');
const { Webhook } = await import('svix');
const { syncUsernameFromClerkEvent } = syncMocks;

describe('/api/clerk/webhook', () => {
  const mockWebhook = {
    verify: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Set required environment variable
    process.env.CLERK_WEBHOOK_SECRET = 'test_webhook_secret';

    // Mock headers
    vi.mocked(headers).mockResolvedValue(
      new Map([
        ['svix-id', 'svix_123'],
        ['svix-timestamp', '1234567890'],
        ['svix-signature', 'signature_123'],
      ]) as any
    );

    // Mock webhook verification
    vi.mocked(Webhook).mockImplementation(() => mockWebhook as any);
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
      mockWebhook.verify.mockReturnValue(eventData);

      // Mock Clerk client
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
      expect(result.fullName).toBe('John Doe');
      expect(result.suggestedUsername).toBe('john');

      expect(mockUpdateUser).toHaveBeenCalledWith('user_123', {
        privateMetadata: {
          fullName: 'John Doe',
          suggestedUsername: 'john',
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
      mockWebhook.verify.mockReturnValue(eventData);

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
      expect(result.suggestedUsername).toBe('john');
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
      mockWebhook.verify.mockReturnValue(eventData);

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
      expect(result.suggestedUsername).toBe('johndoe');
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
      mockWebhook.verify.mockReturnValue(eventData);

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
      expect(result.suggestedUsername).toMatch(/^al[a-z0-9]{3}$/); // 'al' + 3 random chars
      // Short names get random suffix to ensure minimum length of 3 characters
    });
  });

  describe('webhook security', () => {
    it('should reject requests with missing headers', async () => {
      vi.mocked(headers).mockResolvedValue(new Map() as any);

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
      mockWebhook.verify.mockImplementation(() => {
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
      // Mock missing webhook secret
      const originalEnv = process.env.CLERK_WEBHOOK_SECRET;
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

      // Restore environment
      if (originalEnv) {
        process.env.CLERK_WEBHOOK_SECRET = originalEnv;
      }
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
      mockWebhook.verify.mockReturnValue(eventData);

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

  describe('user.updated username sync', () => {
    it('should call syncUsernameFromClerkEvent and return success', async () => {
      const eventData = {
        data: {
          id: 'user_123',
          username: 'new-handle',
          email_addresses: [],
          first_name: null,
          last_name: null,
          private_metadata: {},
          public_metadata: {},
        },
        object: 'event' as const,
        type: 'user.updated' as const,
      };

      mockWebhook.verify.mockReturnValue(eventData);
      syncUsernameFromClerkEvent.mockResolvedValue(undefined);

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
      expect(syncUsernameFromClerkEvent).toHaveBeenCalledWith(
        'user_123',
        'new-handle',
        {}
      );
    });

    it('should handle sync errors gracefully', async () => {
      const eventData = {
        data: {
          id: 'user_123',
          username: 'new-handle',
          email_addresses: [],
          first_name: null,
          last_name: null,
          private_metadata: {},
          public_metadata: {},
        },
        object: 'event' as const,
        type: 'user.updated' as const,
      };

      mockWebhook.verify.mockReturnValue(eventData);
      syncUsernameFromClerkEvent.mockRejectedValue(new Error('sync-failed'));

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
      expect(result.error).toBe('Failed to sync from Clerk');
      expect(syncUsernameFromClerkEvent).toHaveBeenCalledWith(
        'user_123',
        'new-handle',
        {}
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
      mockWebhook.verify.mockReturnValue(eventData);

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

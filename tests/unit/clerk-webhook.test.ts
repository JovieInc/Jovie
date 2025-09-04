import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/clerk/webhook/route';

// Mock dependencies
vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation((secret) => ({
    verify: vi.fn()
  }))
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: {
    users: {
      updateUser: vi.fn()
    }
  }
}));

vi.mock('next/headers', () => ({
  headers: vi.fn()
}));

const mockWebhook = vi.mocked((await import('svix')).Webhook);
const mockClerkClient = vi.mocked((await import('@clerk/nextjs/server')).clerkClient);
const mockHeaders = vi.mocked((await import('next/headers')).headers);

describe('Clerk Webhook API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up default environment
    process.env.CLERK_WEBHOOK_SECRET = 'test-webhook-secret';
    
    // Set up default headers mock
    mockHeaders.mockResolvedValue(new Map([
      ['svix-id', 'test-id'],
      ['svix-timestamp', '1234567890'],
      ['svix-signature', 'test-signature']
    ]) as any);
  });

  describe('webhook signature verification', () => {
    it('should reject requests without webhook secret', async () => {
      delete process.env.CLERK_WEBHOOK_SECRET;
      
      const request = new NextRequest('http://localhost:3000/api/clerk/webhook', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData.error).toBe('Webhook secret not configured');
    });

    it('should reject requests without required svix headers', async () => {
      mockHeaders.mockResolvedValue(new Map() as any);
      
      const request = new NextRequest('http://localhost:3000/api/clerk/webhook', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.error).toBe('Missing svix headers');
    });

    it('should reject requests with invalid signatures', async () => {
      const mockVerify = vi.fn().mockImplementation(() => {
        throw new Error('Invalid signature');
      });
      mockWebhook.mockImplementation(() => ({ verify: mockVerify }) as any);

      const request = new NextRequest('http://localhost:3000/api/clerk/webhook', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.error).toBe('Invalid webhook signature');
    });
  });

  describe('user.created event handling', () => {
    beforeEach(() => {
      const mockVerify = vi.fn().mockReturnValue({
        type: 'user.created',
        data: {
          id: 'user_123',
          email_addresses: [{ email_address: 'test@example.com' }],
          first_name: 'John',
          last_name: 'Doe',
          private_metadata: {}
        }
      });
      mockWebhook.mockImplementation(() => ({ verify: mockVerify }) as any);
    });

    it('should process user.created events successfully', async () => {
      const mockUpdateUser = vi.fn().mockResolvedValue({});
      mockClerkClient.users.updateUser = mockUpdateUser;

      const request = new NextRequest('http://localhost:3000/api/clerk/webhook', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.received).toBe(true);
      expect(mockUpdateUser).toHaveBeenCalledWith('user_123', {
        privateMetadata: expect.objectContaining({
          fullName: 'John Doe',
          usernameSuggestions: expect.arrayContaining(['john']),
          webhookProcessed: true,
          webhookProcessedAt: expect.any(String)
        })
      });
    });

    it('should handle user with only first name', async () => {
      const mockVerify = vi.fn().mockReturnValue({
        type: 'user.created',
        data: {
          id: 'user_123',
          email_addresses: [{ email_address: 'test@example.com' }],
          first_name: 'John',
          private_metadata: {}
        }
      });
      mockWebhook.mockImplementation(() => ({ verify: mockVerify }) as any);

      const mockUpdateUser = vi.fn().mockResolvedValue({});
      mockClerkClient.users.updateUser = mockUpdateUser;

      const request = new NextRequest('http://localhost:3000/api/clerk/webhook', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockUpdateUser).toHaveBeenCalledWith('user_123', {
        privateMetadata: expect.objectContaining({
          fullName: 'John',
          usernameSuggestions: expect.arrayContaining(['john'])
        })
      });
    });

    it('should handle user with username fallback', async () => {
      const mockVerify = vi.fn().mockReturnValue({
        type: 'user.created',
        data: {
          id: 'user_123',
          email_addresses: [{ email_address: 'test@example.com' }],
          username: 'johndoe',
          private_metadata: {}
        }
      });
      mockWebhook.mockImplementation(() => ({ verify: mockVerify }) as any);

      const mockUpdateUser = vi.fn().mockResolvedValue({});
      mockClerkClient.users.updateUser = mockUpdateUser;

      const request = new NextRequest('http://localhost:3000/api/clerk/webhook', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockUpdateUser).toHaveBeenCalledWith('user_123', {
        privateMetadata: expect.objectContaining({
          fullName: 'johndoe',
          usernameSuggestions: expect.arrayContaining(['johndoe'])
        })
      });
    });

    it('should handle email-based name extraction', async () => {
      const mockVerify = vi.fn().mockReturnValue({
        type: 'user.created',
        data: {
          id: 'user_123',
          email_addresses: [{ email_address: 'john.doe@example.com' }],
          private_metadata: {}
        }
      });
      mockWebhook.mockImplementation(() => ({ verify: mockVerify }) as any);

      const mockUpdateUser = vi.fn().mockResolvedValue({});
      mockClerkClient.users.updateUser = mockUpdateUser;

      const request = new NextRequest('http://localhost:3000/api/clerk/webhook', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockUpdateUser).toHaveBeenCalledWith('user_123', {
        privateMetadata: expect.objectContaining({
          fullName: 'John Doe',
          usernameSuggestions: expect.arrayContaining(['john'])
        })
      });
    });

    it('should generate username suggestions correctly', async () => {
      const mockVerify = vi.fn().mockReturnValue({
        type: 'user.created',
        data: {
          id: 'user_123',
          email_addresses: [{ email_address: 'jane.smith@example.com' }],
          first_name: 'Jane',
          private_metadata: {}
        }
      });
      mockWebhook.mockImplementation(() => ({ verify: mockVerify }) as any);

      const mockUpdateUser = vi.fn().mockResolvedValue({});
      mockClerkClient.users.updateUser = mockUpdateUser;

      const request = new NextRequest('http://localhost:3000/api/clerk/webhook', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      
      const updateCall = mockUpdateUser.mock.calls[0];
      const privateMetadata = updateCall[1].privateMetadata;
      
      expect(privateMetadata.usernameSuggestions).toHaveLength(3);
      expect(privateMetadata.usernameSuggestions).toContain('jane');
      expect(privateMetadata.usernameSuggestions.some((s: string) => s.includes('jane'))).toBe(true);
    });

    it('should continue processing even if user update fails', async () => {
      const mockUpdateUser = vi.fn().mockRejectedValue(new Error('Update failed'));
      mockClerkClient.users.updateUser = mockUpdateUser;

      const request = new NextRequest('http://localhost:3000/api/clerk/webhook', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await POST(request);
      const responseData = await response.json();

      // Should still return success to prevent Clerk from retrying
      expect(response.status).toBe(200);
      expect(responseData.received).toBe(true);
    });
  });

  describe('other event types', () => {
    it('should handle unknown event types gracefully', async () => {
      const mockVerify = vi.fn().mockReturnValue({
        type: 'user.updated',
        data: { id: 'user_123' }
      });
      mockWebhook.mockImplementation(() => ({ verify: mockVerify }) as any);

      const request = new NextRequest('http://localhost:3000/api/clerk/webhook', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.received).toBe(true);
      expect(mockClerkClient.users.updateUser).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle general errors gracefully', async () => {
      mockHeaders.mockRejectedValue(new Error('Headers error'));

      const request = new NextRequest('http://localhost:3000/api/clerk/webhook', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData.error).toBe('Internal server error');
    });
  });
});
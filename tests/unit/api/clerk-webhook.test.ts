import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Clerk client
const mockUpdateUserMetadata = vi.fn();
const mockCreateClerkClient = vi.fn(() => ({
  users: {
    updateUserMetadata: mockUpdateUserMetadata,
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  createClerkClient: mockCreateClerkClient,
}));

// Import the handler after mocking
const { POST } = require('@/app/api/clerk/webhook/route');

describe('/api/clerk/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLERK_WEBHOOK_SECRET = 'test-secret';
    process.env.CLERK_SECRET_KEY = 'test-clerk-secret';
  });

  const createSignedRequest = (body: object, secret = 'test-secret') => {
    const payload = JSON.stringify(body);
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    
    // Mock NextRequest methods
    const request = {
      text: () => Promise.resolve(payload),
      headers: {
        get: (name: string) => {
          if (name === 'clerk-signature') return `sha256=${signature}`;
          return null;
        },
      },
    } as unknown as NextRequest;

    return request;
  };

  it('should handle user.created event with first name', async () => {
    const webhookBody = {
      type: 'user.created',
      data: {
        id: 'user_123',
        email_addresses: [{ email_address: 'test@example.com' }],
        first_name: 'John',
        last_name: 'Doe',
      },
    };

    const request = createSignedRequest(webhookBody);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ received: true });
    expect(mockUpdateUserMetadata).toHaveBeenCalledWith('user_123', {
      publicMetadata: {
        suggested_username: 'john',
      },
      privateMetadata: {
        full_name: 'John Doe',
      },
    });
  });

  it('should handle user.created event with email fallback', async () => {
    const webhookBody = {
      type: 'user.created',
      data: {
        id: 'user_456',
        email_addresses: [{ email_address: 'johndoe@example.com' }],
      },
    };

    const request = createSignedRequest(webhookBody);
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockUpdateUserMetadata).toHaveBeenCalledWith('user_456', {
      publicMetadata: {
        suggested_username: 'johndoe',
      },
      privateMetadata: {
        full_name: 'johndoe',
      },
    });
  });

  it('should handle user.created event with short name fallback', async () => {
    const webhookBody = {
      type: 'user.created',
      data: {
        id: 'user_789',
        email_addresses: [{ email_address: 'a@b.com' }],
        first_name: 'Jo',
      },
    };

    const request = createSignedRequest(webhookBody);
    const response = await POST(request);

    expect(response.status).toBe(200);
    
    // Should generate a fallback username since 'jo' is too short
    const call = mockUpdateUserMetadata.mock.calls[0];
    expect(call[0]).toBe('user_789');
    expect(call[1].privateMetadata.full_name).toBe('Jo');
    expect(call[1].publicMetadata.suggested_username).toMatch(/^user\d{6}$/);
  });

  it('should handle long names by truncating username', async () => {
    const longName = 'a'.repeat(25);
    const webhookBody = {
      type: 'user.created',
      data: {
        id: 'user_999',
        email_addresses: [{ email_address: 'test@example.com' }],
        first_name: longName,
      },
    };

    const request = createSignedRequest(webhookBody);
    const response = await POST(request);

    expect(response.status).toBe(200);
    
    const call = mockUpdateUserMetadata.mock.calls[0];
    expect(call[1].publicMetadata.suggested_username).toBe('a'.repeat(20));
  });

  it('should reject invalid signatures', async () => {
    const webhookBody = {
      type: 'user.created',
      data: { id: 'user_123' },
    };

    const request = createSignedRequest(webhookBody, 'wrong-secret');
    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
  });

  it('should reject requests without signatures', async () => {
    const payload = JSON.stringify({ type: 'user.created', data: { id: 'user_123' } });
    
    const request = {
      text: () => Promise.resolve(payload),
      headers: {
        get: () => null,
      },
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
  });

  it('should handle unhandled event types gracefully', async () => {
    const webhookBody = {
      type: 'user.updated',
      data: { id: 'user_123' },
    };

    const request = createSignedRequest(webhookBody);
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
  });

  it('should return 500 when webhook secret is missing', async () => {
    delete process.env.CLERK_WEBHOOK_SECRET;

    const webhookBody = {
      type: 'user.created',
      data: { id: 'user_123' },
    };

    const request = createSignedRequest(webhookBody);
    const response = await POST(request);

    expect(response.status).toBe(500);
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
  });
});
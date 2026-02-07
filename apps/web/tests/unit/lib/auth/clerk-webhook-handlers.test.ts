import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClerkClient = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    users: { updateUser: vi.fn().mockResolvedValue({}) },
  })
);
const mockSyncAllClerkMetadata = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ success: true })
);
const mockHandleClerkUserDeleted = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ success: true })
);
const mockSyncEmailFromClerkByClerkId = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ success: true })
);
const mockInvalidateProxyUserStateCache = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined)
);
const mockNotifySlackSignup = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined)
);

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: mockClerkClient,
}));

vi.mock('@/lib/auth/clerk-sync', () => ({
  syncAllClerkMetadata: mockSyncAllClerkMetadata,
  handleClerkUserDeleted: mockHandleClerkUserDeleted,
  syncEmailFromClerkByClerkId: mockSyncEmailFromClerkByClerkId,
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: mockInvalidateProxyUserStateCache,
}));

vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackSignup: mockNotifySlackSignup,
}));

import { userCreatedHandler } from '@/lib/auth/clerk-webhook/handlers/user-created-handler';
import { userDeletedHandler } from '@/lib/auth/clerk-webhook/handlers/user-deleted-handler';
import { userUpdatedHandler } from '@/lib/auth/clerk-webhook/handlers/user-updated-handler';
import type { ClerkWebhookContext } from '@/lib/auth/clerk-webhook/types';

function makeContext(
  eventType: string,
  userData: Record<string, unknown>
): ClerkWebhookContext {
  return {
    event: {
      data: {
        id: 'user_test',
        first_name: null,
        last_name: null,
        email_addresses: [],
        private_metadata: {},
        public_metadata: {},
        ...userData,
      },
      object: 'event',
      type: eventType,
    },
    clerkUserId: (userData.id as string) || 'user_test',
  };
}

describe('user-created-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have the correct event type', () => {
    expect(userCreatedHandler.eventTypes).toEqual(['user.created']);
  });

  it('should process new user with full name', async () => {
    const context = makeContext('user.created', {
      id: 'user_new',
      first_name: 'John',
      last_name: 'Doe',
    });

    const result = await userCreatedHandler.handle(context);

    expect(result.success).toBe(true);
    expect(result.fullName).toBe('John Doe');
    expect(mockSyncAllClerkMetadata).toHaveBeenCalledWith('user_new');
  });

  it('should handle user with only first name', async () => {
    const context = makeContext('user.created', {
      id: 'user_first_only',
      first_name: 'Madonna',
      last_name: null,
    });

    const result = await userCreatedHandler.handle(context);

    expect(result.success).toBe(true);
    expect(result.fullName).toBe('Madonna');
  });

  it('should handle user with no name', async () => {
    const context = makeContext('user.created', {
      id: 'user_no_name',
      first_name: null,
      last_name: null,
    });

    const result = await userCreatedHandler.handle(context);

    expect(result.success).toBe(true);
    expect(mockSyncAllClerkMetadata).toHaveBeenCalledWith('user_no_name');
  });

  it('should return error when metadata sync fails', async () => {
    mockSyncAllClerkMetadata.mockResolvedValueOnce({
      success: false,
      error: 'Sync failed',
    });

    const context = makeContext('user.created', {
      id: 'user_sync_fail',
      first_name: 'Test',
      last_name: 'User',
    });

    const result = await userCreatedHandler.handle(context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to sync Clerk metadata');
  });

  it('should send Slack notification (fire-and-forget)', async () => {
    const context = makeContext('user.created', {
      id: 'user_slack',
      first_name: 'Jane',
      last_name: 'Doe',
      email_addresses: [
        {
          id: 'email_1',
          email_address: 'jane@example.com',
          verification: { status: 'verified' },
        },
      ],
    });

    await userCreatedHandler.handle(context);

    expect(mockNotifySlackSignup).toHaveBeenCalledWith(
      'Jane Doe',
      'jane@example.com'
    );
  });

  it('should handle errors gracefully', async () => {
    mockClerkClient.mockRejectedValueOnce(new Error('Clerk API down'));

    const context = makeContext('user.created', {
      id: 'user_error',
      first_name: 'Error',
      last_name: 'User',
    });

    const result = await userCreatedHandler.handle(context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to process user data');
  });
});

describe('user-deleted-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have the correct event type', () => {
    expect(userDeletedHandler.eventTypes).toEqual(['user.deleted']);
  });

  it('should process user deletion successfully', async () => {
    const context = makeContext('user.deleted', { id: 'user_delete' });

    const result = await userDeletedHandler.handle(context);

    expect(result.success).toBe(true);
    expect(result.message).toBe('User deletion processed');
    expect(mockHandleClerkUserDeleted).toHaveBeenCalledWith('user_delete');
  });

  it('should return error when deletion fails', async () => {
    mockHandleClerkUserDeleted.mockResolvedValueOnce({
      success: false,
      error: 'User not found',
    });

    const context = makeContext('user.deleted', { id: 'user_not_found' });

    const result = await userDeletedHandler.handle(context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('User not found');
  });

  it('should handle unexpected errors', async () => {
    mockHandleClerkUserDeleted.mockRejectedValueOnce(
      new Error('DB connection lost')
    );

    const context = makeContext('user.deleted', { id: 'user_db_error' });

    const result = await userDeletedHandler.handle(context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to process user deletion');
  });
});

describe('user-updated-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have the correct event type', () => {
    expect(userUpdatedHandler.eventTypes).toEqual(['user.updated']);
  });

  it('should sync verified primary email', async () => {
    const context = makeContext('user.updated', {
      id: 'user_email_update',
      primary_email_address_id: 'email_1',
      email_addresses: [
        {
          id: 'email_1',
          email_address: 'new@example.com',
          verification: { status: 'verified' },
        },
      ],
    });

    const result = await userUpdatedHandler.handle(context);

    expect(result.success).toBe(true);
    expect(mockSyncEmailFromClerkByClerkId).toHaveBeenCalledWith(
      'user_email_update',
      'new@example.com'
    );
  });

  it('should skip unverified email addresses', async () => {
    const context = makeContext('user.updated', {
      id: 'user_unverified',
      primary_email_address_id: 'email_1',
      email_addresses: [
        {
          id: 'email_1',
          email_address: 'unverified@example.com',
          verification: { status: 'unverified' },
        },
      ],
    });

    const result = await userUpdatedHandler.handle(context);

    expect(result.success).toBe(true);
    expect(mockSyncEmailFromClerkByClerkId).not.toHaveBeenCalled();
  });

  it('should invalidate proxy cache', async () => {
    const context = makeContext('user.updated', {
      id: 'user_cache',
      email_addresses: [],
    });

    await userUpdatedHandler.handle(context);

    expect(mockInvalidateProxyUserStateCache).toHaveBeenCalledWith(
      'user_cache'
    );
  });

  it('should return error when email sync fails', async () => {
    mockSyncEmailFromClerkByClerkId.mockResolvedValueOnce({
      success: false,
      error: 'DB write failed',
    });

    const context = makeContext('user.updated', {
      id: 'user_sync_fail',
      primary_email_address_id: 'email_1',
      email_addresses: [
        {
          id: 'email_1',
          email_address: 'fail@example.com',
          verification: { status: 'verified' },
        },
      ],
    });

    const result = await userUpdatedHandler.handle(context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to sync email from Clerk');
  });

  it('should handle unexpected errors', async () => {
    mockInvalidateProxyUserStateCache.mockRejectedValueOnce(
      new Error('Cache unavailable')
    );

    const context = makeContext('user.updated', {
      id: 'user_error',
      email_addresses: [],
    });

    const result = await userUpdatedHandler.handle(context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to sync from Clerk');
  });
});

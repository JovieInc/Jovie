import { describe, expect, it, vi } from 'vitest';
import {
  type BuildAdminUserActionsCallbacks,
  buildAdminUserActions,
} from '@/components/admin/admin-users-table/admin-user-actions';
import type { AdminUserRow } from '@/lib/admin/users';

function makeUser(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: 'user_1',
    clerkId: 'clerk_1',
    name: 'Test User',
    email: 'test@example.com',
    userStatus: 'active',
    createdAt: new Date('2026-01-01'),
    deletedAt: null,
    isPro: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    plan: 'free',
    profileUsername: null,
    founderWelcomeSentAt: null,
    welcomeFailedAt: null,
    outboundSuppressedAt: null,
    suppressionFailedAt: null,
    profileCreatedAt: null,
    profileOrigin: null,
    socialLinks: [],
    ...overrides,
  };
}

function makeCallbacks(): BuildAdminUserActionsCallbacks {
  return {
    onCopyClerkId: vi.fn(),
    onCopyEmail: vi.fn(),
    onCopyUserId: vi.fn(),
    onOpenInClerk: vi.fn(),
  };
}

describe('buildAdminUserActions', () => {
  it('returns copy actions for a user with email and clerkId', () => {
    const user = makeUser();
    const callbacks = makeCallbacks();
    const items = buildAdminUserActions(user, callbacks);

    const actionItems = items.filter(
      item => 'id' in item && item.id !== undefined
    );
    expect(actionItems).toHaveLength(4);
    expect(actionItems.map(i => ('id' in i ? i.id : null))).toEqual([
      'copy-clerk-id',
      'copy-email',
      'copy-user-id',
      'open-in-clerk',
    ]);
  });

  it('disables copy email when user has no email', () => {
    const user = makeUser({ email: null });
    const callbacks = makeCallbacks();
    const items = buildAdminUserActions(user, callbacks);

    const copyEmail = items.find(
      item => 'id' in item && item.id === 'copy-email'
    );
    expect(copyEmail).toBeDefined();
    expect('disabled' in copyEmail! && copyEmail.disabled).toBe(true);
  });

  it('omits Open in Clerk when clerkId is empty', () => {
    const user = makeUser({ clerkId: '' });
    const callbacks = makeCallbacks();
    const items = buildAdminUserActions(user, callbacks);

    const openInClerk = items.find(
      item => 'id' in item && item.id === 'open-in-clerk'
    );
    expect(openInClerk).toBeUndefined();

    // Should also have no separator
    const separators = items.filter(
      item => 'type' in item && item.type === 'separator'
    );
    expect(separators).toHaveLength(0);
  });

  it('includes separator before Open in Clerk when clerkId is present', () => {
    const user = makeUser({ clerkId: 'clerk_abc' });
    const callbacks = makeCallbacks();
    const items = buildAdminUserActions(user, callbacks);

    const separators = items.filter(
      item => 'type' in item && item.type === 'separator'
    );
    expect(separators).toHaveLength(1);
  });

  it('invokes the correct callback when onClick is called', () => {
    const user = makeUser();
    const callbacks = makeCallbacks();
    const items = buildAdminUserActions(user, callbacks);

    // Find and invoke copy-clerk-id
    const copyClerkId = items.find(
      item => 'id' in item && item.id === 'copy-clerk-id'
    );
    if (copyClerkId && 'onClick' in copyClerkId) {
      copyClerkId.onClick?.();
    }
    expect(callbacks.onCopyClerkId).toHaveBeenCalledWith(user);

    // Find and invoke copy-user-id
    const copyUserId = items.find(
      item => 'id' in item && item.id === 'copy-user-id'
    );
    if (copyUserId && 'onClick' in copyUserId) {
      copyUserId.onClick?.();
    }
    expect(callbacks.onCopyUserId).toHaveBeenCalledWith(user);

    // Find and invoke open-in-clerk
    const openInClerk = items.find(
      item => 'id' in item && item.id === 'open-in-clerk'
    );
    if (openInClerk && 'onClick' in openInClerk) {
      openInClerk.onClick?.();
    }
    expect(callbacks.onOpenInClerk).toHaveBeenCalledWith(user);
  });
});

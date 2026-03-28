import { describe, expect, it, vi } from 'vitest';
import {
  type BuildAdminUserActionsCallbacks,
  buildAdminUserActions,
} from '@/features/admin/admin-users-table/admin-user-actions';
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
    onBanUser: vi.fn(),
    onUnbanUser: vi.fn(),
  };
}

describe('buildAdminUserActions', () => {
  it('returns copy actions, external link, and moderation for active user', () => {
    const user = makeUser();
    const callbacks = makeCallbacks();
    const items = buildAdminUserActions(user, callbacks);

    const actionItems = items.filter(
      item => 'id' in item && item.id !== undefined
    );
    expect(actionItems.map(i => ('id' in i ? i.id : null))).toEqual([
      'copy-clerk-id',
      'copy-email',
      'copy-user-id',
      'open-in-clerk',
      'suspend-user',
    ]);
  });

  it('shows restore action for banned user', () => {
    const user = makeUser({ userStatus: 'banned' });
    const callbacks = makeCallbacks();
    const items = buildAdminUserActions(user, callbacks);

    const actionItems = items.filter(
      item => 'id' in item && item.id !== undefined
    );
    expect(actionItems.map(i => ('id' in i ? i.id : null))).toContain(
      'restore-user'
    );
    expect(actionItems.map(i => ('id' in i ? i.id : null))).not.toContain(
      'suspend-user'
    );
  });

  it('shows restore action for suspended user', () => {
    const user = makeUser({ userStatus: 'suspended' });
    const callbacks = makeCallbacks();
    const items = buildAdminUserActions(user, callbacks);

    const actionItems = items.filter(
      item => 'id' in item && item.id !== undefined
    );
    expect(actionItems.map(i => ('id' in i ? i.id : null))).toContain(
      'restore-user'
    );
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

  it('omits Open in Clerk when clerkId is empty but keeps moderation', () => {
    const user = makeUser({ clerkId: '' });
    const callbacks = makeCallbacks();
    const items = buildAdminUserActions(user, callbacks);

    const openInClerk = items.find(
      item => 'id' in item && item.id === 'open-in-clerk'
    );
    expect(openInClerk).toBeUndefined();

    // Should have one separator (before moderation group)
    const separators = items.filter(
      item => 'type' in item && item.type === 'separator'
    );
    expect(separators).toHaveLength(1);
  });

  it('includes two separators when clerkId is present', () => {
    const user = makeUser({ clerkId: 'clerk_abc' });
    const callbacks = makeCallbacks();
    const items = buildAdminUserActions(user, callbacks);

    const separators = items.filter(
      item => 'type' in item && item.type === 'separator'
    );
    expect(separators).toHaveLength(2);
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

    // Find and invoke suspend-user
    const suspendUser = items.find(
      item => 'id' in item && item.id === 'suspend-user'
    );
    if (suspendUser && 'onClick' in suspendUser) {
      suspendUser.onClick?.();
    }
    expect(callbacks.onBanUser).toHaveBeenCalledWith(user);
  });

  it('invokes onUnbanUser callback for banned user', () => {
    const user = makeUser({ userStatus: 'banned' });
    const callbacks = makeCallbacks();
    const items = buildAdminUserActions(user, callbacks);

    const restoreUser = items.find(
      item => 'id' in item && item.id === 'restore-user'
    );
    if (restoreUser && 'onClick' in restoreUser) {
      restoreUser.onClick?.();
    }
    expect(callbacks.onUnbanUser).toHaveBeenCalledWith(user);
  });
});

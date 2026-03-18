import { describe, expect, it, vi } from 'vitest';

import { executeBulkAction } from '@/features/admin/admin-creator-profiles/hooks/useBulkActions';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createProfile(
  overrides: Partial<AdminCreatorProfileRow> = {}
): AdminCreatorProfileRow {
  return {
    id: 'creator-1',
    username: 'alice',
    usernameNormalized: 'alice',
    avatarUrl: null,
    displayName: 'Alice',
    isVerified: false,
    isFeatured: false,
    marketingOptOut: false,
    isClaimed: false,
    claimToken: null,
    claimTokenExpiresAt: null,
    userId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ingestionStatus: 'idle',
    lastIngestionError: null,
    socialLinks: [],
    ...overrides,
  };
}

describe('executeBulkAction', () => {
  it('calls action on each selected profile and toasts success', async () => {
    const { toast } = await import('sonner');
    const profiles = [
      createProfile({ id: '1' }),
      createProfile({ id: '2' }),
      createProfile({ id: '3' }),
    ];
    const selectedIds = new Set(['1', '3']);
    const action = vi.fn().mockResolvedValue({ success: true });
    const clearSelection = vi.fn();
    const refresh = vi.fn();

    await executeBulkAction({
      profiles,
      selectedIds,
      action,
      successLabel: 'Verified',
      failureLabel: 'verify',
      clearSelection,
      refresh,
    });

    expect(action).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith('Verified 2 creators');
    expect(clearSelection).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('toasts error count when some actions fail', async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    const profiles = [createProfile({ id: '1' }), createProfile({ id: '2' })];
    const selectedIds = new Set(['1', '2']);
    const action = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });
    const clearSelection = vi.fn();
    const refresh = vi.fn();

    await executeBulkAction({
      profiles,
      selectedIds,
      action,
      successLabel: 'Featured',
      failureLabel: 'feature',
      clearSelection,
      refresh,
    });

    expect(toast.error).toHaveBeenCalledWith('Failed to feature 1 creator');
    expect(clearSelection).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no profiles are selected', async () => {
    const action = vi.fn();
    const clearSelection = vi.fn();
    const refresh = vi.fn();

    await executeBulkAction({
      profiles: [createProfile()],
      selectedIds: new Set(),
      action,
      successLabel: 'Verified',
      failureLabel: 'verify',
      clearSelection,
      refresh,
    });

    expect(action).not.toHaveBeenCalled();
    expect(clearSelection).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('pluralizes correctly for single profile', async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.success).mockClear();
    const profiles = [createProfile({ id: '1' })];
    const selectedIds = new Set(['1']);
    const action = vi.fn().mockResolvedValue({ success: true });

    await executeBulkAction({
      profiles,
      selectedIds,
      action,
      successLabel: 'Verified',
      failureLabel: 'verify',
      clearSelection: vi.fn(),
      refresh: vi.fn(),
    });

    expect(toast.success).toHaveBeenCalledWith('Verified 1 creator');
  });
});

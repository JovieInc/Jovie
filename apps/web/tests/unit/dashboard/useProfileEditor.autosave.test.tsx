import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProfileEditor } from '@/components/features/dashboard/organisms/links/hooks/useProfileEditor';

const mockRefresh = vi.fn();
const mockMutateAsync = vi.fn();

const dashboardData = {
  selectedProfile: {
    id: 'profile_a',
    displayName: 'Original Name',
    username: 'original-handle',
    creatorType: 'artist' as const,
  },
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => dashboardData,
}));

vi.mock('@/lib/queries', () => ({
  useProfileSaveMutation: () => ({
    mutateAsync: mockMutateAsync,
  }),
  useAvatarMutation: () => ({
    mutateAsync: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock('@/types/db', () => ({
  convertDrizzleCreatorProfileToArtist: vi.fn(profile => ({
    id: profile.id,
    owner_user_id: 'user_123',
    handle: profile.username,
    spotify_id: '',
    name: profile.displayName,
    image_url: undefined,
    tagline: undefined,
    theme: undefined,
    settings: { hide_branding: false },
    spotify_url: undefined,
    apple_music_url: undefined,
    youtube_url: undefined,
    venmo_handle: undefined,
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: new Date().toISOString(),
  })),
}));

describe('useProfileEditor autosave binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardData.selectedProfile = {
      id: 'profile_a',
      displayName: 'Original Name',
      username: 'original-handle',
      creatorType: 'artist',
    };
    mockMutateAsync.mockResolvedValue({
      profile: {
        id: 'profile_a',
        displayName: 'Updated Name',
        username: 'original-handle',
        avatarUrl: null,
        creatorType: 'artist',
        isPublic: true,
      },
    });
  });

  it('does not send profile A keystrokes through profile B', async () => {
    const { result, rerender } = renderHook(() =>
      useProfileEditor({ debounceMs: 50 })
    );

    act(() => {
      result.current.setEditingField('displayName');
      result.current.handleDisplayNameChange('Alice Draft');
    });

    dashboardData.selectedProfile = {
      id: 'profile_b',
      displayName: 'Bob',
      username: 'bob',
      creatorType: 'artist',
    };
    rerender();

    await act(async () => {
      await result.current.debouncedProfileSave.flush();
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('keeps an in-flight profile A write bound to A after switching to B', async () => {
    let resolveUpdate: ((value: unknown) => void) | undefined;
    mockMutateAsync.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveUpdate = resolve;
        })
    );

    const { result, rerender } = renderHook(() =>
      useProfileEditor({ debounceMs: 50 })
    );

    act(() => {
      result.current.setEditingField('displayName');
      result.current.handleDisplayNameChange('Alice In Flight');
    });

    let flushPromise!: Promise<void>;
    act(() => {
      flushPromise = result.current.debouncedProfileSave.flush();
    });
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

    dashboardData.selectedProfile = {
      id: 'profile_b',
      displayName: 'Bob',
      username: 'bob',
      creatorType: 'artist',
    };
    rerender();

    await act(async () => {
      resolveUpdate?.({
        profile: {
          id: 'profile_a',
          displayName: 'Alice In Flight',
          username: 'original-handle',
          avatarUrl: null,
          creatorType: 'artist',
          isPublic: true,
        },
      });
      await flushPromise;
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith({
      profileId: 'profile_a',
      updates: {
        displayName: 'Alice In Flight',
        username: 'original-handle',
      },
    });
  });

  it('clears the saving indicator when a stale acknowledgment is skipped', async () => {
    let resolveUpdate: ((value: unknown) => void) | undefined;
    mockMutateAsync.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveUpdate = resolve;
        })
    );

    const { result } = renderHook(() =>
      useProfileEditor({ debounceMs: 50 })
    );

    act(() => {
      result.current.setEditingField('displayName');
      result.current.handleDisplayNameChange('Older Name');
    });

    let flushPromise!: Promise<void>;
    act(() => {
      flushPromise = result.current.debouncedProfileSave.flush();
    });
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.handleDisplayNameChange('Original Name');
    });

    await act(async () => {
      resolveUpdate?.({
        profile: {
          id: 'profile_a',
          displayName: 'Older Name',
          username: 'original-handle',
          avatarUrl: null,
          creatorType: 'artist',
          isPublic: true,
        },
      });
      await flushPromise;
    });

    expect(result.current.profileDisplayName).toBe('Original Name');
    expect(result.current.profileSaveStatus.saving).toBe(false);
    expect(result.current.profileSaveStatus.success).not.toBe(true);
  });
});

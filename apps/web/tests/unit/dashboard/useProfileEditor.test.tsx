import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProfileEditor } from '@/components/features/dashboard/organisms/links/hooks/useProfileEditor';

const mockRefresh = vi.fn();
const mockMutateAsync = vi.fn();

const dashboardData = {
  selectedProfile: {
    id: 'profile_chat_1',
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

vi.mock('@/lib/pacer/hooks/useAutoSave', () => ({
  useAutoSave: ({
    saveFn,
  }: {
    saveFn: (data: { displayName: string; username: string }) => Promise<void>;
  }) => ({
    save: (data: { displayName: string; username: string }) => {
      void saveFn(data);
    },
    flush: async () => {},
    cancel: () => {},
  }),
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

describe('useProfileEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardData.selectedProfile = {
      id: 'profile_chat_1',
      displayName: 'Original Name',
      username: 'original-handle',
      creatorType: 'artist',
    };
    mockMutateAsync.mockResolvedValue({
      profile: {
        id: dashboardData.selectedProfile.id,
        displayName: 'Updated Name',
        username: dashboardData.selectedProfile.username,
        avatarUrl: null,
        creatorType: 'artist',
        isPublic: true,
      },
    });
  });

  it('does not call router.refresh after profile auto-save', async () => {
    const { result } = renderHook(() => useProfileEditor({ debounceMs: 100 }));

    await act(async () => {
      result.current.setEditingField('displayName');
      result.current.handleDisplayNameChange('Updated Name');
      await Promise.resolve();
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      updates: {
        displayName: 'Updated Name',
        username: dashboardData.selectedProfile.username,
      },
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('does not reset in-progress display name when selectedProfile changes during edit', async () => {
    const { result, rerender } = renderHook(() =>
      useProfileEditor({ debounceMs: 100 })
    );

    act(() => {
      result.current.setEditingField('displayName');
      result.current.handleDisplayNameChange('Typing In Progress');
    });

    expect(result.current.profileDisplayName).toBe('Typing In Progress');

    dashboardData.selectedProfile = {
      ...dashboardData.selectedProfile,
      displayName: 'Server Snapshot',
    };
    rerender();

    expect(result.current.profileDisplayName).toBe('Typing In Progress');
    expect(mockRefresh).not.toHaveBeenCalled();

    act(() => {
      result.current.handleInputBlur();
    });

    expect(result.current.profileDisplayName).toBe('Typing In Progress');
    expect(result.current.editingField).toBeNull();
  });
});

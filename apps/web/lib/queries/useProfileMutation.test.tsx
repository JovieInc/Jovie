import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAvatarMutation } from './useProfileMutation';

const { mockUpdateProfile, mockUploadAvatar } = vi.hoisted(() => ({
  mockUpdateProfile: vi.fn(),
  mockUploadAvatar: vi.fn(),
}));

vi.mock('./fetch', () => ({
  createMutationFn: () => mockUpdateProfile,
  FetchError: class extends Error {
    isClientError() {
      return false;
    }
  },
}));

vi.mock('./mutation-utils', () => ({
  handleMutationError: vi.fn(),
}));

vi.mock('./useAvatarUploadMutation', () => ({
  uploadAvatarToBlob: mockUploadAvatar,
}));

vi.mock('./keys', () => ({
  queryKeys: {
    user: { profile: () => ['user', 'profile'] as const },
    dashboard: { all: ['dashboard'] as const },
  },
}));

const SELECTED_PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROFILE_ID = '22222222-2222-4222-8222-222222222222';

describe('useAvatarMutation', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => ReactNode;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadAvatar.mockResolvedValue('https://blob.example/avatar.avif');
    mockUpdateProfile.mockResolvedValue({
      profile: { id: SELECTED_PROFILE_ID },
    });
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  it('rejects a missing selected profile id before uploading a blob', async () => {
    queryClient.setQueryData(['user', 'profile'], {
      profile: { id: 'legacy-envelope-profile' },
    });
    const { result } = renderHook(
      () => useAvatarMutation({ profileId: undefined }),
      { wrapper }
    );
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });

    await expect(
      act(async () => {
        await result.current.mutateAsync(file);
      })
    ).rejects.toThrow('Missing profile id');

    expect(mockUploadAvatar).not.toHaveBeenCalled();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('uses the explicit selected profile id instead of the cache envelope', async () => {
    queryClient.setQueryData(['user', 'profile'], {
      profile: { id: 'legacy-envelope-profile' },
    });
    const { result } = renderHook(
      () => useAvatarMutation({ profileId: SELECTED_PROFILE_ID }),
      { wrapper }
    );
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });

    await act(async () => {
      await result.current.mutateAsync(file);
    });

    expect(mockUploadAvatar).toHaveBeenCalledExactlyOnceWith(file);
    expect(mockUpdateProfile).toHaveBeenCalledExactlyOnceWith({
      profileId: SELECTED_PROFILE_ID,
      updates: { avatarUrl: 'https://blob.example/avatar.avif' },
    });
  });

  it('does not update another profile cache after a switch during upload', async () => {
    let resolveUpload: ((url: string) => void) | undefined;
    mockUploadAvatar.mockImplementationOnce(
      () =>
        new Promise<string>(resolve => {
          resolveUpload = resolve;
        })
    );
    queryClient.setQueryData(['user', 'profile'], {
      id: SELECTED_PROFILE_ID,
      avatarUrl: 'https://blob.example/original.avif',
    });
    const { result, rerender } = renderHook(
      ({ profileId }) => useAvatarMutation({ profileId }),
      { initialProps: { profileId: SELECTED_PROFILE_ID }, wrapper }
    );
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    let mutationPromise: Promise<string> | undefined;

    act(() => {
      mutationPromise = result.current.mutateAsync(file);
    });
    await waitFor(() => expect(mockUploadAvatar).toHaveBeenCalledOnce());

    const otherProfile = {
      id: OTHER_PROFILE_ID,
      avatarUrl: 'https://blob.example/other.avif',
    };
    queryClient.setQueryData(['user', 'profile'], otherProfile);
    rerender({ profileId: OTHER_PROFILE_ID });

    await act(async () => {
      resolveUpload?.('https://blob.example/new.avif');
      await mutationPromise;
    });

    expect(queryClient.getQueryData(['user', 'profile'])).toEqual(otherProfile);
  });
});

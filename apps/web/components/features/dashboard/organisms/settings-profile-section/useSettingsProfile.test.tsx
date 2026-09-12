import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Artist } from '@/types/db';

import { useSettingsProfile } from './useSettingsProfile';

const mockSaveProfile = vi.fn();
const mockOnRefresh = vi.fn();
const mockOnArtistUpdate = vi.fn();

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock('@/lib/queries', () => ({
  useProfileSaveMutation: () => ({
    mutateAsync: mockSaveProfile,
  }),
  useUserAvatarMutation: () => ({
    mutateAsync: vi.fn(),
  }),
  useProfileMutation: () => ({
    mutateAsync: vi.fn(),
  }),
}));

function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: 'artist-a',
    owner_user_id: 'user-1',
    handle: 'alice',
    spotify_id: '',
    name: 'Alice',
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: '2026-01-01T00:00:00.000Z',
    location: 'NYC',
    hometown: 'Boston',
    career_highlights: 'sold out',
    target_playlists: ['rapcaviar'],
    ...overrides,
  };
}

describe('useSettingsProfile autosave binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveProfile.mockResolvedValue({
      profile: {
        username: 'alice',
        displayName: 'Alice Updated',
        location: 'NYC',
        settings: { hometown: 'Boston' },
      },
    });
  });

  it('does not write profile A edits through profile B after a switch', async () => {
    const artistA = makeArtist();
    const artistB = makeArtist({
      id: 'artist-b',
      handle: 'bob',
      name: 'Bob',
    });
    const { result, rerender } = renderHook(
      ({ artist }) =>
        useSettingsProfile({
          artist,
          onArtistUpdate: mockOnArtistUpdate,
          onRefresh: mockOnRefresh,
        }),
      { initialProps: { artist: artistA } }
    );

    act(() => {
      result.current.saveProfile({
        displayName: 'Alice Draft',
        username: 'alice',
        location: 'NYC',
        hometown: 'Boston',
        careerHighlights: 'sold out',
        targetPlaylists: 'rapcaviar',
      });
    });

    rerender({ artist: artistB });

    await act(async () => {
      result.current.flushSave();
      await Promise.resolve();
    });

    expect(mockSaveProfile).not.toHaveBeenCalled();
    expect(mockOnRefresh).not.toHaveBeenCalled();
  });

  it('does not apply an older profile A acknowledgment over newer local input', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const firstPromise = new Promise(resolve => {
      resolveFirst = resolve;
    });
    mockSaveProfile.mockImplementationOnce(() => firstPromise);

    const artistA = makeArtist();
    const { result } = renderHook(() =>
      useSettingsProfile({
        artist: artistA,
        onArtistUpdate: mockOnArtistUpdate,
        onRefresh: mockOnRefresh,
      })
    );

    act(() => {
      result.current.saveProfile({
        displayName: 'Older',
        username: 'alice',
        location: 'NYC',
        hometown: 'Boston',
        careerHighlights: 'sold out',
        targetPlaylists: 'rapcaviar',
      });
      result.current.flushSave();
    });

    act(() => {
      result.current.saveProfile({
        displayName: 'Newer',
        username: 'alice',
        location: 'NYC',
        hometown: 'Boston',
        careerHighlights: 'sold out',
        targetPlaylists: 'rapcaviar',
      });
    });

    await act(async () => {
      resolveFirst?.({
        profile: {
          username: 'alice',
          displayName: 'Older',
          location: 'NYC',
          settings: { hometown: 'Boston' },
        },
      });
      await firstPromise;
      result.current.flushSave();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.formData.displayName).not.toBe('Older');
  });

  it('clears the saving indicator when a stale acknowledgment is skipped', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const firstPromise = new Promise(resolve => {
      resolveFirst = resolve;
    });
    mockSaveProfile.mockImplementationOnce(() => firstPromise);

    const artistA = makeArtist();
    const { result } = renderHook(() =>
      useSettingsProfile({
        artist: artistA,
        onArtistUpdate: mockOnArtistUpdate,
        onRefresh: mockOnRefresh,
      })
    );

    act(() => {
      result.current.saveProfile({
        displayName: 'Older',
        username: 'alice',
        location: 'NYC',
        hometown: 'Boston',
        careerHighlights: 'sold out',
        targetPlaylists: 'rapcaviar',
      });
      result.current.flushSave();
    });

    act(() => {
      result.current.saveProfile({
        displayName: 'Alice',
        username: 'alice',
        location: 'NYC',
        hometown: 'Boston',
        careerHighlights: 'sold out',
        targetPlaylists: 'rapcaviar',
      });
    });

    await act(async () => {
      resolveFirst?.({
        profile: {
          username: 'alice',
          displayName: 'Older',
          location: 'NYC',
          settings: { hometown: 'Boston' },
        },
      });
      await firstPromise;
      result.current.flushSave();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.formData.displayName).not.toBe('Older');
    expect(result.current.profileSaveStatus.saving).toBe(false);
    expect(result.current.profileSaveStatus.success).not.toBe(true);
  });
});

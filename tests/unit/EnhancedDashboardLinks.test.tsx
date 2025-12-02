import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnhancedDashboardLinks } from '@/components/dashboard/organisms/EnhancedDashboardLinks';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/dashboard/molecules/ProfilePreview', () => ({
  ProfilePreview: ({
    username,
    avatarUrl,
  }: {
    username: string;
    avatarUrl?: string | null;
  }) => (
    <div data-testid='profile-preview'>
      {username}
      {avatarUrl ? `-${avatarUrl}` : ''}
    </div>
  ),
}));

vi.mock('@/lib/utils', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils');

  return {
    ...actual,
    debounce: <T extends (...args: unknown[]) => unknown>(
      func: T,
      _wait: number
    ): ((...args: Parameters<T>) => void) & { cancel: () => void } => {
      void _wait;
      const debounced = (...args: Parameters<T>): void => {
        void func(...args);
      };

      (debounced as typeof debounced & { cancel: () => void }).cancel =
        () => {};

      return debounced as ((...args: Parameters<T>) => void) & {
        cancel: () => void;
      };
    },
  };
});

vi.mock('@/app/dashboard/DashboardDataContext', () => ({
  DashboardDataProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='dashboard-data-provider'>{children}</div>
  ),
  useDashboardData: () => ({
    user: { id: 'user_123' },
    creatorProfiles: [],
    selectedProfile: { id: 'profile_123' },
    needsOnboarding: false,
    sidebarCollapsed: false,
    hasSocialLinks: false,
    isAdmin: false,
  }),
}));

vi.mock('@/types/db', async () => {
  const actual =
    await vi.importActual<typeof import('@/types/db')>('@/types/db');

  return {
    ...actual,
    convertDrizzleCreatorProfileToArtist: vi.fn(() => ({
      id: 'artist_123',
      owner_user_id: 'user_123',
      handle: 'handle',
      spotify_id: '',
      name: 'Artist',
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
  };
});

vi.mock('@/components/dashboard/organisms/GroupedLinksManager', () => ({
  GroupedLinksManager: ({
    onLinksChange,
  }: {
    onLinksChange: (links: unknown[]) => void;
  }) => {
    onLinksChange([
      {
        platform: {
          id: 'website',
          name: 'Website',
          category: 'custom',
          icon: 'website',
          color: '000000',
          placeholder: 'https://example.com',
        },
        normalizedUrl: 'https://example.com',
        originalUrl: 'https://example.com',
        suggestedTitle: 'Website',
        isValid: true,
      },
    ]);
    return <div data-testid='grouped-links-manager' />;
  },
}));

describe('EnhancedDashboardLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces API error messages from social-links endpoint', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Server validation error' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }) as unknown as Response
    );

    render(<EnhancedDashboardLinks initialLinks={[]} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('Server validation error');
    });

    fetchMock.mockRestore();
  });

  it('shows success toast when social-links save succeeds', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }) as unknown as Response
    );

    render(<EnhancedDashboardLinks initialLinks={[]} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Links saved successfully')
      );
      expect(toast.error).not.toHaveBeenCalled();
    });

    fetchMock.mockRestore();
  });
});

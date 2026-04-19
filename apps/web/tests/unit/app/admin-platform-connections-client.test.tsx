import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformConnectionsClient } from '@/app/app/(shell)/admin/platform-connections/PlatformConnectionsClient';

const { mockGenerateTestPlaylist, mockUseUserSafe } = vi.hoisted(() => ({
  mockGenerateTestPlaylist: vi.fn(),
  mockUseUserSafe: vi.fn(),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: mockUseUserSafe,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@jovie/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <button
      type='button'
      aria-pressed={checked}
      onClick={() => onCheckedChange(!checked)}
    >
      Playlist Engine
    </button>
  ),
}));

vi.mock('@/components/molecules/ConfirmDialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    description,
    confirmLabel,
    onConfirm,
  }: {
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div role='dialog' aria-label={title}>
        <p>{description}</p>
        <button type='button' onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}));

vi.mock('@/app/app/(shell)/admin/platform-connections/actions', () => ({
  generateTestPlaylist: mockGenerateTestPlaylist,
  setCurrentAdminAsPlaylistSpotifyPublisher: vi.fn(),
  updatePlaylistEngineSettings: vi.fn(),
}));

const healthySpotifyStatus = {
  connected: true,
  healthy: true,
  source: 'database' as const,
  clerkUserId: 'user_1',
  accountLabel: 'Jovie',
  approvedScopes: [],
  missingScopes: [],
  updatedAt: null,
  error: null,
};

const engineSettings = {
  enabled: false,
  intervalValue: 3,
  intervalUnit: 'days' as const,
  lastGeneratedAt: null,
  nextEligibleAt: null,
};

describe('PlatformConnectionsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserSafe.mockReturnValue({ user: null });
    mockGenerateTestPlaylist.mockResolvedValue({
      success: true,
      message: 'Test playlist generated and queued for review.',
    });
  });

  it('renders the disconnected Spotify state and disabled action', () => {
    render(
      <PlatformConnectionsClient
        currentTab='spotify'
        spotifyStatus={{
          ...healthySpotifyStatus,
          connected: false,
          healthy: false,
          source: 'missing',
          accountLabel: null,
          error: 'Playlist Spotify publisher is not configured.',
        }}
        engineSettings={engineSettings}
        currentUser={{
          hasSpotify: false,
          label: null,
          missingScopes: [],
        }}
      />
    );

    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Use This Account/i })
    ).toBeDisabled();
  });

  it('opens the generate confirmation dialog from the engine tab', async () => {
    const user = userEvent.setup();
    render(
      <PlatformConnectionsClient
        currentTab='engine'
        spotifyStatus={healthySpotifyStatus}
        engineSettings={engineSettings}
        currentUser={{
          hasSpotify: true,
          label: 'Jovie',
          missingScopes: [],
        }}
      />
    );

    expect(screen.getByText('Disabled')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Generate Test Playlist' })
    );

    expect(
      screen.getByRole('dialog', { name: 'Generate Test Playlist?' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/It will not publish to Spotify/i)
    ).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DspPresenceSidebar } from '@/features/dashboard/organisms/dsp-presence/DspPresenceSidebar';

const { mockUseDashboardData, mockUseDspMatchActions } = vi.hoisted(() => ({
  mockUseDashboardData: vi.fn(),
  mockUseDspMatchActions: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    <img alt={alt} {...props} />
  ),
}));

vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<object>('@jovie/ui');
  return {
    ...actual,
    Button: ({ children, ...props }: ComponentProps<'button'>) => (
      <button type='button' {...props}>
        {children}
      </button>
    ),
  };
});

vi.mock('next/navigation', () => ({}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataContext: { Provider: ({ children }: { children: React.ReactNode }) => children, Consumer: () => null, displayName: 'DashboardDataContext' },
  useDashboardData: mockUseDashboardData,
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock('@/components/molecules/drawer/DrawerSection', () => ({
  DrawerSection: ({
    children,
    title,
  }: {
    children: ReactNode;
    title: string;
  }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

vi.mock('@/components/molecules/drawer/DrawerSurfaceCard', () => ({
  DrawerSurfaceCard: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/components/molecules/drawer/EntitySidebarShell', () => ({
  EntitySidebarShell: ({
    entityHeader,
    children,
    isOpen,
  }: {
    entityHeader?: ReactNode;
    children: ReactNode;
    isOpen: boolean;
  }) =>
    isOpen ? (
      <aside>
        {entityHeader}
        {children}
      </aside>
    ) : null,
}));

vi.mock('@/components/molecules/drawer-header/DrawerHeaderActions', () => ({
  DrawerHeaderActions: () => <button type='button'>More actions</button>,
}));

vi.mock('@/features/dashboard/atoms/DspProviderIcon', () => ({
  PROVIDER_LABELS: {
    spotify: 'Spotify',
    apple_music: 'Apple Music',
  },
  DspProviderIcon: ({ provider }: { provider: string }) => (
    <span>{provider}</span>
  ),
}));

vi.mock('@/features/dashboard/atoms/MatchStatusBadge', () => ({
  MatchStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

vi.mock('@/features/dashboard/organisms/dsp-matches/hooks', () => ({
  useDspMatchActions: mockUseDspMatchActions,
}));

describe('DspPresenceSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDashboardData.mockReturnValue({
      selectedProfile: { id: 'profile-123' },
    });
    mockUseDspMatchActions.mockReturnValue({
      confirmMatch: vi.fn(),
      rejectMatch: vi.fn(),
      isConfirming: false,
      isRejecting: false,
    });
  });

  it('shows suggested-match actions when the item is actionable', () => {
    render(
      <DspPresenceSidebar
        item={{
          matchId: 'match-1',
          providerId: 'spotify',
          status: 'suggested',
          confidenceScore: 0.91,
          matchingIsrcCount: 3,
          matchSource: 'isrc_discovery',
          confirmedAt: null,
          externalArtistName: 'Midnight Echo',
          externalArtistUrl: 'https://open.spotify.com/artist/123',
          externalArtistImageUrl: null,
          confidenceBreakdown: null,
        }}
        onClose={() => undefined}
      />
    );

    expect(screen.getByText('Verified by ISRC matching')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirm Match' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(screen.getByText('View on Spotify')).toBeInTheDocument();
  });

  it('hides suggested actions for manually linked platforms', () => {
    render(
      <DspPresenceSidebar
        item={{
          matchId: 'match-2',
          providerId: 'apple_music',
          status: 'confirmed',
          confidenceScore: null,
          matchingIsrcCount: 0,
          matchSource: 'manual',
          confirmedAt: '2026-04-01T00:00:00.000Z',
          externalArtistName: 'Manual Artist',
          externalArtistUrl: 'https://music.apple.com/artist/manual',
          externalArtistImageUrl: null,
          confidenceBreakdown: null,
        }}
        onClose={() => undefined}
      />
    );

    expect(screen.getByText('Linked manually')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirm Match' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reject' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('View on Apple Music')).toBeInTheDocument();
  });

  it('calls confirm and reject match actions', async () => {
    const user = userEvent.setup();

    render(
      <DspPresenceSidebar
        item={{
          matchId: 'match-3',
          providerId: 'spotify',
          status: 'suggested',
          confidenceScore: 0.95,
          matchingIsrcCount: 5,
          matchSource: 'musicfetch',
          confirmedAt: null,
          externalArtistName: 'Action Artist',
          externalArtistUrl: 'https://open.spotify.com/artist/action',
          externalArtistImageUrl: null,
          confidenceBreakdown: null,
        }}
        onClose={() => undefined}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Confirm Match' }));
    await user.click(screen.getByRole('button', { name: 'Reject' }));

    const { confirmMatch, rejectMatch } =
      mockUseDspMatchActions.mock.results[0].value;
    expect(confirmMatch).toHaveBeenCalledWith('match-3');
    expect(rejectMatch).toHaveBeenCalledWith('match-3');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DspPresenceSidebar } from './DspPresenceSidebar';

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
  DashboardDataContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: () => null,
    displayName: 'DashboardDataContext',
  },
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

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/components/feedback', () => ({ toast: toastMock }));

type Item = NonNullable<ComponentProps<typeof DspPresenceSidebar>['item']>;

const suggested: Item = {
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
};

const confirmed: Item = {
  ...suggested,
  matchId: 'match-2',
  status: 'confirmed',
  matchSource: 'manual',
  confirmedAt: '2026-04-01T12:00:00.000Z',
  externalArtistName: 'Manual Artist',
};

describe('DspPresenceSidebar certificate', () => {
  let actions: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDashboardData.mockReturnValue({
      selectedProfile: { id: 'profile-123' },
    });
    actions = {
      confirmMatch: vi.fn(),
      rejectMatch: vi.fn(),
      isConfirming: false,
      isRejecting: false,
    };
    mockUseDspMatchActions.mockImplementation(() => actions);
  });

  it('confirms and rejects a suggested match and stays axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DspPresenceSidebar item={suggested} onClose={() => undefined} />
    );

    await user.click(screen.getByRole('button', { name: 'Confirm Match' }));
    await user.click(screen.getByRole('button', { name: 'Reject' }));

    expect(actions.confirmMatch).toHaveBeenCalledWith('match-1');
    expect(actions.rejectMatch).toHaveBeenCalledWith('match-1');
    await expectNoA11yViolations(container);
  });

  it('flags a missing artist image with the warning tokens', () => {
    render(<DspPresenceSidebar item={suggested} onClose={() => undefined} />);
    const badge = screen.getByRole('img', { name: 'Profile Image Missing' });
    expect(badge).toHaveClass('bg-warning-subtle');
    expect(badge.className).not.toMatch(/amber/);
  });

  it('shows pending labels and disables actions while a match is saving', async () => {
    actions = { ...actions, isConfirming: true };
    const { container } = render(
      <DspPresenceSidebar item={suggested} onClose={() => undefined} />
    );
    expect(
      screen.getByRole('button', { name: 'Confirming...' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('opens the remove confirmation for a linked platform and confirms it', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DspPresenceSidebar item={confirmed} onClose={() => undefined} />
    );

    expect(screen.getByText('Apr 1, 2026')).toBeInTheDocument();
    await user.click(screen.getByTestId('presence-remove-platform'));
    expect(
      await screen.findByRole('alertdialog', { name: 'Remove Spotify?' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(actions.rejectMatch).toHaveBeenCalledWith(
      'match-2',
      'user_disconnected'
    );
    await expectNoA11yViolations(container);
  });

  it('toasts on remove success and failure', () => {
    render(<DspPresenceSidebar item={confirmed} onClose={() => undefined} />);
    const options = mockUseDspMatchActions.mock.calls.at(-1)?.[0] as {
      onRejectSuccess: () => void;
      onError: () => void;
    };
    options.onRejectSuccess();
    options.onError();
    expect(toastMock.success).toHaveBeenCalledWith('Spotify removed');
    expect(toastMock.error).toHaveBeenCalledWith(
      'Failed to remove Spotify. Please try again.'
    );
  });

  it('renders nothing actionable without a selected profile', async () => {
    mockUseDashboardData.mockReturnValue({ selectedProfile: null });
    const { container } = render(
      <DspPresenceSidebar item={suggested} onClose={() => undefined} />
    );
    expect(
      screen.queryByRole('button', { name: 'Confirm Match' })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the empty state when no platform is selected', () => {
    const { container } = render(
      <DspPresenceSidebar item={null} onClose={() => undefined} />
    );
    expect(container.querySelector('aside')).toBeNull();
  });

  it('falls back to Unknown Artist and long names stay in one header', async () => {
    const { container } = render(
      <DspPresenceSidebar
        item={{
          ...suggested,
          externalArtistName: null,
          externalArtistUrl: null,
        }}
        onClose={() => undefined}
      />
    );
    expect(screen.getByText('Unknown Artist')).toBeInTheDocument();
    expect(screen.queryByText('View On Spotify')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

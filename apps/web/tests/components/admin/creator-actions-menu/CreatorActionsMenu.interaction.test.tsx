import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreatorActionsMenu } from '@/components/admin/creator-actions-menu/CreatorActionsMenu';
import { copyToClipboard } from '@/hooks/useClipboard';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: vi.fn(),
}));

const mockedCopyToClipboard = vi.mocked(copyToClipboard);

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

function createProfile(
  overrides: Partial<AdminCreatorProfileRow> = {}
): AdminCreatorProfileRow {
  return {
    id: 'creator-1',
    username: 'dina',
    usernameNormalized: 'dina',
    avatarUrl: null,
    displayName: 'Dina',
    isVerified: false,
    isFeatured: false,
    marketingOptOut: false,
    isClaimed: false,
    claimToken: 'claim-token-123',
    claimTokenExpiresAt: null,
    userId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ingestionStatus: 'idle',
    lastIngestionError: null,
    socialLinks: [],
    ...overrides,
  };
}

function renderMenu(
  profile: AdminCreatorProfileRow,
  props: Partial<React.ComponentProps<typeof CreatorActionsMenu>> = {}
) {
  const handlers = {
    onToggleVerification: vi.fn(async () => {}),
    onToggleFeatured: vi.fn(async () => {}),
    onToggleMarketing: vi.fn(async () => {}),
    onRefreshIngest: vi.fn(async () => {}),
    onSendInvite: vi.fn(),
    onDelete: vi.fn(),
  };

  render(
    <CreatorActionsMenu
      profile={profile}
      isMobile={true}
      status='idle'
      refreshIngestStatus='idle'
      {...handlers}
      {...props}
    />
  );

  return handlers;
}

describe('CreatorActionsMenu interaction tests', () => {
  it('opens dropdown and fires action handlers', async () => {
    const user = userEvent.setup();
    const handlers = renderMenu(createProfile());

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /verify creator/i }));

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /feature/i }));

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(
      screen.getByRole('menuitem', { name: /disable marketing emails/i })
    );

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /send invite/i }));

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /delete creator/i }));

    expect(handlers.onToggleVerification).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleFeatured).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleMarketing).toHaveBeenCalledTimes(1);
    expect(handlers.onSendInvite).toHaveBeenCalledTimes(1);
    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders conditional labels for verified and featured profiles', async () => {
    const user = userEvent.setup();

    renderMenu(createProfile({ isVerified: true, isFeatured: true }));

    await user.click(screen.getByRole('button', { name: /actions/i }));

    expect(
      screen.getByRole('menuitem', { name: /unverify creator/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /^unfeature$/i })
    ).toBeInTheDocument();
  });

  it('shows copy feedback and reverts after 2000ms', async () => {
    mockedCopyToClipboard.mockResolvedValue(true);
    const user = userEvent.setup();

    renderMenu(createProfile());

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(
      screen.getByRole('menuitem', { name: /copy claim link/i })
    );

    expect(mockedCopyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining('/dina/claim?token=claim-token-123')
    );

    await user.click(screen.getByRole('button', { name: /actions/i }));
    expect(
      screen.getByRole('menuitem', { name: /copied!/i })
    ).toBeInTheDocument();

    await waitFor(
      () => {
        expect(
          screen.getByRole('menuitem', { name: /copy claim link/i })
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('disables trigger while loading', () => {
    renderMenu(createProfile(), { status: 'loading' });

    expect(screen.getByRole('button', { name: /actions/i })).toBeDisabled();
  });

  it('shows claim actions for unclaimed profiles with claim token', async () => {
    const user = userEvent.setup();

    renderMenu(
      createProfile({ isClaimed: false, claimToken: 'claim-token-123' })
    );

    await user.click(screen.getByRole('button', { name: /actions/i }));

    expect(
      screen.getByRole('menuitem', { name: /copy claim link/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /send invite/i })
    ).toBeInTheDocument();
  });

  it('hides claim section for claimed creators and no-token creators', async () => {
    const user = userEvent.setup();

    renderMenu(createProfile({ isClaimed: true }));

    await user.click(screen.getByRole('button', { name: /actions/i }));

    expect(
      screen.queryByRole('menuitem', { name: /copy claim link/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /send invite/i })
    ).not.toBeInTheDocument();
  });
});

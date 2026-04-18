import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreatorActionsMenu } from '@/features/admin/creator-actions-menu/CreatorActionsMenu';
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
    location: null,
    hometown: null,
    activeSinceYear: null,
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

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /actions/i }));
}

describe('CreatorActionsMenu interaction tests', () => {
  it('renders all expected menu items for a standard creator', async () => {
    const user = userEvent.setup();
    renderMenu(createProfile());

    await openMenu(user);

    const menu = screen.getByRole('menu');
    expect(
      within(menu).getByRole('menuitem', { name: /refresh ingest/i })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: /verify creator/i })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: /^feature$/i })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: /disable marketing emails/i })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: /view profile/i })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: /send invite/i })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: /delete creator/i })
    ).toBeInTheDocument();
  });

  it('fires each action handler from menu interactions', async () => {
    const user = userEvent.setup();
    const handlers = renderMenu(createProfile());

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /verify creator/i }));

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /^feature$/i }));

    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: /disable marketing emails/i })
    );

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /send invite/i }));

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /delete creator/i }));

    expect(handlers.onToggleVerification).toHaveBeenCalledOnce();
    expect(handlers.onToggleFeatured).toHaveBeenCalledOnce();
    expect(handlers.onToggleMarketing).toHaveBeenCalledOnce();
    expect(handlers.onSendInvite).toHaveBeenCalledOnce();
    expect(handlers.onDelete).toHaveBeenCalledOnce();
  });

  it('closes the menu after selecting an action', async () => {
    const user = userEvent.setup();
    renderMenu(createProfile());

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /verify creator/i }));

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('renders conditional labels for verified and featured profiles', async () => {
    const user = userEvent.setup();

    renderMenu(createProfile({ isVerified: true, isFeatured: true }));

    await openMenu(user);

    expect(
      screen.getByRole('menuitem', { name: /unverify creator/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /^unfeature$/i })
    ).toBeInTheDocument();
  });

  it('does not show copy claim link (tokens are hashed)', async () => {
    const user = userEvent.setup();

    renderMenu(createProfile());

    await openMenu(user);
    expect(
      screen.queryByRole('menuitem', { name: /copy claim link/i })
    ).not.toBeInTheDocument();
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

    await openMenu(user);

    expect(
      screen.getByRole('menuitem', { name: /send invite/i })
    ).toBeInTheDocument();
  });

  it('hides claim section for claimed creators and no-token creators', async () => {
    const user = userEvent.setup();

    renderMenu(createProfile({ isClaimed: true }));

    await openMenu(user);

    expect(
      screen.queryByRole('menuitem', { name: /copy claim link/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /send invite/i })
    ).not.toBeInTheDocument();
  });

  it('hides delete action for featured creators', async () => {
    const user = userEvent.setup();

    renderMenu(createProfile({ isFeatured: true }));
    await openMenu(user);

    expect(
      screen.queryByRole('menuitem', { name: /delete creator/i })
    ).not.toBeInTheDocument();
  });
});

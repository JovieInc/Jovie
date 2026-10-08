import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminUserDetailDrawer } from '@/components/features/admin/admin-users-table/AdminUserDetailDrawer';
import type { AdminUserRow } from '@/lib/admin/types';

const clipboard = vi.hoisted(() => ({
  copy: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/hooks/useClipboard', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useClipboard')>()),
  copyToClipboard: clipboard.copy,
}));

vi.mock('@/components/feedback', async importOriginal => {
  const actual = await importOriginal<typeof import('@/components/feedback')>();
  return {
    ...actual,
    toast: {
      ...actual.toast,
      success: clipboard.success,
      error: clipboard.error,
    },
  };
});

vi.mock('@/components/molecules/drawer/RightDrawer', () => ({
  RightDrawer: ({
    children,
    isOpen,
    ariaLabel,
    onKeyDown,
  }: {
    children: ReactNode;
    isOpen: boolean;
    ariaLabel: string;
    onKeyDown?: (event: KeyboardEvent) => void;
  }) =>
    isOpen ? (
      <aside
        aria-label={ariaLabel}
        onKeyDown={event => onKeyDown?.(event.nativeEvent)}
      >
        {children}
      </aside>
    ) : null,
}));

const user: AdminUserRow = {
  id: 'user-1',
  clerkId: 'clerk-1',
  name: 'Alex Rivera',
  email: 'alex@example.com',
  userStatus: 'active',
  createdAt: new Date('2026-07-01T12:00:00Z'),
  deletedAt: null,
  isPro: true,
  stripeCustomerId: 'cus_123',
  stripeSubscriptionId: null,
  plan: 'pro',
  profileUsername: 'alex',
  founderWelcomeSentAt: null,
  welcomeFailedAt: null,
  outboundSuppressedAt: null,
  suppressionFailedAt: null,
  profileCreatedAt: new Date('2026-07-01T12:00:00Z'),
  profileOrigin: 'onboarding',
  socialLinks: [
    {
      id: 'link-1',
      platform: 'spotify',
      platformType: 'dsp',
      url: 'https://open.spotify.com/artist/alex',
      displayText: 'Spotify',
    },
  ],
};

describe('AdminUserDetailDrawer', () => {
  it.each([true, false])(
    'keeps header copy focus and targets the current user, including clipboard failure (%s)',
    async succeeds => {
      clipboard.copy.mockReset().mockResolvedValue(succeeds);
      clipboard.success.mockClear();
      clipboard.error.mockClear();
      const props = { onClose: vi.fn(), contextMenuItems: [] };
      const { rerender } = render(
        <AdminUserDetailDrawer {...props} user={user} />
      );
      const copy = screen.getByRole('button', { name: 'Copy Email' });
      copy.focus();
      fireEvent.click(copy);
      await waitFor(() => {
        expect(clipboard.copy).toHaveBeenLastCalledWith('alex@example.com');
        expect(
          succeeds ? clipboard.success : clipboard.error
        ).toHaveBeenCalledWith(
          succeeds ? 'Email copied' : 'Failed to copy Email',
          ...(succeeds ? [{ duration: 2000 }] : [])
        );
      });
      rerender(
        <AdminUserDetailDrawer
          {...props}
          user={{ ...user, name: 'Bea Chen', email: 'bea@example.com' }}
        />
      );
      expect(screen.getByRole('button', { name: 'Copy Email' })).toBe(copy);
      expect(copy).toHaveFocus();
      expect(screen.queryByText('alex@example.com')).not.toBeInTheDocument();
      fireEvent.click(copy);
      await waitFor(() =>
        expect(clipboard.copy).toHaveBeenLastCalledWith('bea@example.com')
      );
    }
  );

  it('uses the compact raised entity hierarchy with summary before details', () => {
    render(
      <AdminUserDetailDrawer
        user={user}
        onClose={vi.fn()}
        contextMenuItems={[]}
      />
    );

    expect(
      screen
        .getByRole('complementary', { name: 'User details' })
        .querySelector('[data-right-rail-workspace]')
    ).toHaveAttribute('data-surface-variant', 'raised');
    expect(screen.getByTestId('entity-sidebar-entity-header')).toHaveAttribute(
      'data-surface-variant',
      'flat'
    );
    expect(screen.getByTestId('admin-user-entity-header')).toHaveClass(
      'relative',
      'flex',
      'items-start',
      'gap-3'
    );
    expect(screen.getByTestId('admin-user-entity-header')).toHaveAttribute(
      'data-layout',
      'inline'
    );
    expect(
      screen.getByTestId('drawer-analytics-metric-value-profile-completeness')
    ).toHaveTextContent('80%');
    expect(
      screen.getByTestId('drawer-analytics-metric-value-linked-destinations')
    ).toHaveTextContent('1');
    expect(screen.getByText('jov.ie/alex')).toBeInTheDocument();
    expect(screen.getByText('User ID')).toBeInTheDocument();
  });

  it('closes the composed user rail through Escape and removes stale details after selection clears', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <AdminUserDetailDrawer
        user={user}
        onClose={onClose}
        contextMenuItems={[]}
      />
    );
    fireEvent.keyDown(
      screen.getByRole('complementary', { name: 'User details' }),
      { key: 'Escape' }
    );
    expect(onClose).toHaveBeenCalledOnce();
    rerender(
      <AdminUserDetailDrawer
        user={null}
        onClose={onClose}
        contextMenuItems={[]}
      />
    );
    expect(
      screen.queryByRole('complementary', { name: 'User details' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('alex@example.com')).not.toBeInTheDocument();
  });
});

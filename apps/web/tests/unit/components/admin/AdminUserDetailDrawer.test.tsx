import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminUserDetailDrawer } from '@/components/features/admin/admin-users-table/AdminUserDetailDrawer';
import type { AdminUserRow } from '@/lib/admin/types';

vi.mock('@/components/molecules/drawer', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/components/molecules/drawer')>();

  return {
    ...actual,
    EntitySidebarShell: ({
      children,
      entityHeader,
      entityHeaderSurface,
      workspaceSurface,
    }: {
      children: ReactNode;
      entityHeader?: ReactNode;
      entityHeaderSurface?: string;
      workspaceSurface?: string;
    }) => (
      <div
        data-entity-header-surface={entityHeaderSurface}
        data-workspace-surface={workspaceSurface}
        data-testid='entity-sidebar-shell'
      >
        {entityHeader}
        {children}
      </div>
    ),
  };
});

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
  it('uses the compact raised entity hierarchy with summary before details', () => {
    render(
      <AdminUserDetailDrawer
        user={user}
        onClose={vi.fn()}
        contextMenuItems={[]}
      />
    );

    expect(screen.getByTestId('entity-sidebar-shell')).toHaveAttribute(
      'data-workspace-surface',
      'raised'
    );
    expect(screen.getByTestId('entity-sidebar-shell')).toHaveAttribute(
      'data-entity-header-surface',
      'flat'
    );
    expect(screen.getByTestId('admin-user-entity-header')).toHaveClass(
      'relative',
      'flex',
      'items-start',
      'gap-3'
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
});

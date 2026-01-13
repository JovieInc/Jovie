import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AdminCreatorProfilesWithSidebar } from '@/components/admin/admin-creator-profiles';
import { ToastProvider } from '@/components/providers/ToastProvider';
import type {
  AdminCreatorProfileRow,
  AdminCreatorProfilesSort,
} from '@/lib/admin/creator-profiles';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: { children: ReactNode; href: string } & ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/components/admin/CreatorAvatarCell', () => ({
  CreatorAvatarCell: ({ username }: { username: string }) => (
    <div data-testid='creator-avatar-cell'>avatar-{username}</div>
  ),
}));

vi.mock('@/components/organisms/ContactSidebar', () => ({
  ContactSidebar: () => null,
}));

vi.mock('@/components/admin/creator-actions-menu', () => ({
  CreatorActionsMenu: () => (
    <button type='button' aria-label='Creator actions'>
      ⋯
    </button>
  ),
  copyTextToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/components/organisms/UserButton', () => ({
  UserButton: () => <div data-testid='user-button' />,
}));

const renderWithProviders = (ui: ReactNode) => {
  return render(
    <ToastProvider>
      <TooltipProvider>{ui}</TooltipProvider>
    </ToastProvider>
  );
};

describe('AdminCreatorProfilesWithSidebar', () => {
  const baseProfile: AdminCreatorProfileRow = {
    id: 'profile-1',
    username: 'alice',
    usernameNormalized: 'alice',
    avatarUrl: null,
    isVerified: false,
    isClaimed: true,
    claimToken: null,
    claimTokenExpiresAt: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    isFeatured: false,
    marketingOptOut: false,
    userId: 'user-1',
    ingestionStatus: 'idle',
    lastIngestionError: null,
  };

  const defaultSort: AdminCreatorProfilesSort = 'created_desc';

  it('renders rows and pagination summary with accessible link', () => {
    renderWithProviders(
      <AdminCreatorProfilesWithSidebar
        profiles={[baseProfile]}
        page={1}
        pageSize={20}
        total={1}
        search=''
        sort={defaultSort}
      />
    );

    const handleText = screen.getByText('@alice');
    expect(handleText.closest('a')).toHaveAttribute('href', '/alice');
    // Claimed/verified are conveyed via aria-labels on icon buttons
    expect(screen.getByLabelText('Claimed')).toBeInTheDocument();
    expect(screen.getByLabelText(/Not verified/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Showing 1[\u2013-]1 of 1 profiles/)
    ).toBeInTheDocument();
    expect(screen.getByTestId('creator-avatar-cell')).toBeInTheDocument();
  });

  it('shows empty state when there are no profiles', () => {
    renderWithProviders(
      <AdminCreatorProfilesWithSidebar
        profiles={[]}
        page={1}
        pageSize={20}
        total={0}
        search='test'
        sort={defaultSort}
      />
    );

    expect(screen.getByText('No creator profiles found.')).toBeInTheDocument();
  });

  it('renders actions menu for unclaimed profiles', () => {
    const unclaimedProfile: AdminCreatorProfileRow = {
      ...baseProfile,
      id: 'profile-2',
      username: 'bob',
      usernameNormalized: 'bob',
      isClaimed: false,
      claimToken: 'test-claim-token',
    };

    renderWithProviders(
      <AdminCreatorProfilesWithSidebar
        profiles={[unclaimedProfile]}
        page={1}
        pageSize={20}
        total={1}
        search=''
        sort={defaultSort}
      />
    );

    expect(screen.getByText('@bob')).toBeInTheDocument();
    expect(screen.getByLabelText('Not claimed')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Creator actions' })
    ).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CreatorProfilesTable } from '@/components/admin/CreatorProfilesTable';
import type {
  AdminCreatorProfileRow,
  AdminCreatorProfilesSort,
} from '@/lib/admin/creator-profiles';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/components/admin/CreatorAvatarCell', () => ({
  CreatorAvatarCell: ({ username }: { username: string }) => (
    <div data-testid='creator-avatar-cell'>avatar-{username}</div>
  ),
}));

describe('CreatorProfilesTable', () => {
  const baseProfile: AdminCreatorProfileRow = {
    id: 'profile-1',
    username: 'alice',
    avatarUrl: null,
    isVerified: false,
    isClaimed: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };

  const defaultSort: AdminCreatorProfilesSort = 'created_desc';

  it('renders rows and pagination summary', () => {
    render(
      <CreatorProfilesTable
        profiles={[baseProfile]}
        page={1}
        pageSize={20}
        total={1}
        search=''
        sort={defaultSort}
      />
    );

    expect(screen.getByText('Creator profiles')).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: '@alice',
      })
    ).toHaveAttribute('href', '/alice');
    expect(screen.getAllByText('Claimed').length).toBeGreaterThan(0);
    expect(screen.getByText('Not verified')).toBeInTheDocument();
    expect(screen.getByText(/Showing 1.*1 of 1 profiles/)).toBeInTheDocument();
    expect(screen.getByTestId('creator-avatar-cell')).toBeInTheDocument();
  });

  it('shows empty state when there are no profiles', () => {
    render(
      <CreatorProfilesTable
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
});

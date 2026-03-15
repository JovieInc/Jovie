import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AdminProfileSidebar } from '@/components/admin/admin-creator-profiles/AdminProfileSidebar';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import type { Contact } from '@/types';

describe('AdminProfileSidebar', () => {
  const profile: AdminCreatorProfileRow = {
    id: 'profile-1',
    username: 'alice',
    usernameNormalized: 'alice',
    avatarUrl: null,
    displayName: 'Alice',
    bio: 'Indie pop artist',
    genres: ['Pop'],
    isVerified: false,
    isFeatured: false,
    marketingOptOut: false,
    isClaimed: true,
    claimToken: null,
    claimTokenExpiresAt: null,
    userId: 'user-1',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ingestionStatus: 'idle',
    lastIngestionError: null,
    socialLinks: [
      {
        id: 'link-1',
        platform: 'instagram',
        platformType: 'instagram',
        url: 'https://instagram.com/alice',
        displayText: '@alice',
      },
    ],
  };

  const contact: Contact = {
    id: 'profile-1',
    username: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
    socialLinks: [
      {
        id: 'link-1',
        label: '@alice',
        platformType: 'instagram',
        url: 'https://instagram.com/alice',
      },
    ],
  };

  it('renders profile tabs and link list', () => {
    render(
      <AdminProfileSidebar
        profile={profile}
        contact={contact}
        isOpen
        onClose={() => {}}
      />
    );

    expect(screen.getByRole('tab', { name: 'Social' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'About' })).toBeInTheDocument();
    expect(screen.getAllByText('@alice').length).toBeGreaterThan(0);
  });

  it('shows about tab content', async () => {
    const user = userEvent.setup();

    render(
      <AdminProfileSidebar
        profile={profile}
        contact={contact}
        isOpen
        onClose={() => {}}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'About' }));

    expect(screen.getByText('Indie pop artist')).toBeInTheDocument();
    expect(screen.getByText('Pop')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CreatorProfileTableRow } from './CreatorProfileTableRow';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/features/admin/CreatorAvatarCell', () => ({
  CreatorAvatarCell: ({ username }: { username: string }) => (
    <div>{username}</div>
  ),
}));

vi.mock('@/features/admin/CreatorProfileSocialLinks', () => ({
  CreatorProfileSocialLinks: () => <div>social links</div>,
}));

vi.mock('@/features/admin/creator-actions-menu', () => ({
  CreatorActionsMenu: () => <button type='button'>Actions</button>,
}));

vi.mock(
  '@/features/admin/creator-actions-menu/CreatorActionsMenuContent',
  () => ({
    CreatorActionsMenuContent: () => <div>Actions content</div>,
  })
);

const profile = {
  id: 'creator_1',
  username: 'alice',
  usernameNormalized: 'alice',
  avatarUrl: null,
  displayName: 'Alice Artist',
  isVerified: false,
  isFeatured: false,
  marketingOptOut: false,
  isClaimed: false,
  claimToken: null,
  claimTokenExpiresAt: null,
  userId: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  ingestionStatus: 'idle' as const,
  lastIngestionError: null,
  location: null,
  hometown: null,
  activeSinceYear: null,
  socialLinks: [],
};

describe('CreatorProfileTableRow', () => {
  it('does not select the row when the nested checkbox is toggled', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onToggleSelect = vi.fn();

    render(
      <table>
        <tbody>
          <CreatorProfileTableRow
            profile={profile}
            rowNumber={1}
            isSelected={false}
            isChecked={false}
            isMobile={false}
            verificationStatus='idle'
            refreshIngestStatus='idle'
            isMenuOpen={false}
            onRowClick={onRowClick}
            onContextMenu={vi.fn()}
            onToggleSelect={onToggleSelect}
            onMenuOpenChange={vi.fn()}
            onRefreshIngest={vi.fn(async () => {})}
            onToggleVerification={vi.fn(async () => {})}
            onToggleFeatured={vi.fn(async () => {})}
            onToggleMarketing={vi.fn(async () => {})}
            onDelete={vi.fn()}
          />
        </tbody>
      </table>
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select alice' }));
    expect(onToggleSelect).toHaveBeenCalledWith('creator_1');
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

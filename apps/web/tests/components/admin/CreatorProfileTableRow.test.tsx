import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CreatorProfileTableRow } from '@/features/admin/CreatorProfileTableRow';

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

describe('CreatorProfileTableRow', () => {
  it('renders a row-level refresh button and triggers refresh action', async () => {
    const user = userEvent.setup();
    const onRefreshIngest = vi.fn(async () => {});

    render(
      <table>
        <tbody>
          <CreatorProfileTableRow
            profile={{
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
              ingestionStatus: 'idle',
              lastIngestionError: null,
              location: null,
              hometown: null,
              activeSinceYear: null,
              socialLinks: [],
            }}
            rowNumber={1}
            isSelected={false}
            isChecked={false}
            isMobile={false}
            verificationStatus='idle'
            refreshIngestStatus='idle'
            isMenuOpen={false}
            onRowClick={vi.fn()}
            onContextMenu={vi.fn()}
            onToggleSelect={vi.fn()}
            onMenuOpenChange={vi.fn()}
            onRefreshIngest={onRefreshIngest}
            onToggleVerification={vi.fn(async () => {})}
            onToggleFeatured={vi.fn(async () => {})}
            onToggleMarketing={vi.fn(async () => {})}
            onDelete={vi.fn()}
          />
        </tbody>
      </table>
    );

    const refreshButton = screen.getByRole('button', {
      name: /refresh creator music data/i,
    });

    expect(refreshButton).toBeInTheDocument();

    await user.click(refreshButton);

    expect(onRefreshIngest).toHaveBeenCalledTimes(1);
  });
});

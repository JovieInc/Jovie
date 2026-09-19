import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatLinkRemovalCard } from './ChatLinkRemovalCard';

const mutateMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  useConfirmChatRemoveLinkMutation: () => ({ mutate: mutateMock }),
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelContext: () => null,
}));

vi.mock('@/components/atoms/SocialIcon', () => ({
  SocialIcon: ({
    platform,
    className,
  }: {
    platform: string;
    className?: string;
  }) => <span data-testid={`social-icon-${platform}`} className={className} />,
}));

describe('ChatLinkRemovalCard', () => {
  it('calls the removal mutation with the link identity', async () => {
    const user = userEvent.setup();
    render(
      <ChatLinkRemovalCard
        profileId='profile-1'
        linkId='link-1'
        platform='Spotify'
        url='https://open.spotify.com/artist/example'
      />
    );

    await user.click(screen.getByRole('button', { name: /^Remove$/i }));

    expect(mutateMock).toHaveBeenCalledWith(
      { profileId: 'profile-1', linkId: 'link-1' },
      expect.any(Object)
    );
  });

  it('renders the canonical cancelled state after dismissal', async () => {
    const user = userEvent.setup();
    render(
      <ChatLinkRemovalCard
        profileId='profile-1'
        linkId='link-1'
        platform='Spotify'
        url='https://open.spotify.com/artist/example'
      />
    );

    await user.click(screen.getByRole('button', { name: 'Cancel Removal' }));

    expect(screen.getByText('Cancelled')).toHaveClass(
      'text-sm',
      'text-secondary-token'
    );
    expect(screen.getByTestId('chat-tool-surface')).toHaveClass(
      'system-b-chat-tool-surface-cancelled'
    );
    expect(screen.queryByRole('button', { name: /^Remove$/i })).toBeNull();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatLinkConfirmationCard } from './ChatLinkConfirmationCard';

vi.mock('@/lib/queries', () => ({
  useConfirmChatLinkMutation: () => ({ mutate: vi.fn() }),
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

describe('ChatLinkConfirmationCard', () => {
  it('keeps the dismissed Undo action at the canonical 28px visible / 44px hit geometry', async () => {
    const user = userEvent.setup();
    render(
      <ChatLinkConfirmationCard
        profileId='profile-1'
        platform={{
          id: 'spotify',
          name: 'Spotify',
          icon: 'spotify',
          color: 'brand-spotify',
        }}
        normalizedUrl='https://open.spotify.com/artist/example'
        originalUrl='https://open.spotify.com/artist/example'
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Dismiss Spotify link' })
    );

    expect(screen.getByTestId('chat-link-dismiss-undo')).toHaveClass(
      'h-auto',
      'min-h-7',
      'before:h-full',
      'before:min-h-11',
      'before:min-w-11'
    );
  });
});

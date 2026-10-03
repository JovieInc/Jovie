import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatLinkConfirmationCard } from './ChatLinkConfirmationCard';

const { confirmMutate } = vi.hoisted(() => ({ confirmMutate: vi.fn() }));

vi.mock('@/lib/queries', () => ({
  useConfirmChatLinkMutation: () => ({ mutate: confirmMutate }),
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

  it('styles the confirm action with canonical button tokens', () => {
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

    const confirm = document.querySelector(
      '.system-b-chat-link-primary-action'
    );
    expect(confirm?.className).toContain('--color-btn-primary-bg');
    expect(confirm?.className).toContain('--color-btn-primary-hover');
    expect(confirm?.className).not.toContain('linear-btn');
  });

  it('renders the mutation error in the canonical error token', async () => {
    confirmMutate.mockImplementationOnce((_variables, options) => {
      options?.onError?.(new Error('request failed'));
    });
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

    await user.click(screen.getByRole('button', { name: 'Add' }));

    const error = await screen.findByText(
      'Unable to add link. Please try again.'
    );
    expect(error).toHaveClass('text-error');
    expect(error).not.toHaveClass('text-danger-token');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

describe('ChatLinkRemovalCard destructive contrast (JOV-8873)', () => {
  it('uses the destructive button tokens for the remove action', () => {
    render(
      <ChatLinkRemovalCard
        profileId='profile-1'
        linkId='link-1'
        platform='Spotify'
        url='https://open.spotify.com/artist/example'
      />
    );
    const remove = screen.getByRole('button', { name: /^Remove$/i });
    expect(remove.className).toContain('bg-(--color-btn-destructive-bg)');
    expect(remove.className).toContain('text-(--color-btn-destructive-fg)');
    expect(remove.className).not.toContain('bg-error ');
  });
});

describe('ChatLinkRemovalCard states', () => {
  const props = {
    profileId: 'profile-1',
    linkId: 'link-1',
    platform: 'Spotify',
    url: 'https://open.spotify.com/artist/example',
  };

  it('renders its actions as design-system plain buttons and stays axe-clean', async () => {
    const { container } = render(<ChatLinkRemovalCard {...props} />);
    const remove = screen.getByRole('button', { name: /^Remove$/i });
    expect(remove).toHaveAttribute('data-slot', 'plain-button');
    expect(remove).toHaveAttribute('type', 'button');
    await expectNoA11yViolations(container);
  });

  it('shows the removed state after the mutation succeeds', async () => {
    mutateMock.mockImplementationOnce(
      (_vars: unknown, opts: { onSuccess?: () => void }) => opts.onSuccess?.()
    );
    const user = userEvent.setup();
    const { container } = render(<ChatLinkRemovalCard {...props} />);
    await user.click(screen.getByRole('button', { name: /^Remove$/i }));
    expect(screen.getByText('Spotify link removed')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows an error and keeps the actions when the mutation fails', async () => {
    mutateMock.mockImplementationOnce(
      (_vars: unknown, opts: { onError?: () => void }) => opts.onError?.()
    );
    const user = userEvent.setup();
    const { container } = render(<ChatLinkRemovalCard {...props} />);
    await user.click(screen.getByRole('button', { name: /^Remove$/i }));
    expect(
      screen.getByText('Unable to remove link. Please try again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Remove$/i })).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('keeps a long url on one truncated line', async () => {
    const longUrl = `https://example.com/${'a'.repeat(300)}`;
    const { container } = render(
      <ChatLinkRemovalCard {...props} url={longUrl} />
    );
    expect(screen.getByText(longUrl)).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });
});

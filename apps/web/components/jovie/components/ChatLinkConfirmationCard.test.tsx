import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchHttpError, FetchNetworkError } from '@/lib/queries/fetch';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatLinkConfirmationCard } from './ChatLinkConfirmationCard';

const { confirmMutate, previewState } = vi.hoisted(() => ({
  confirmMutate: vi.fn(),
  previewState: {
    current: null as null | { setPreviewData: ReturnType<typeof vi.fn> },
  },
}));

vi.mock('@/lib/queries/useConfirmChatLinkMutation', () => ({
  useConfirmChatLinkMutation: () => ({ mutate: confirmMutate }),
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelContext: () => previewState.current,
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

beforeEach(() => {
  globalThis.localStorage.clear();
  previewState.current = null;
});

describe('ChatLinkConfirmationCard', () => {
  it('retains the real confirmation mutation outside preview fixtures', async () => {
    confirmMutate.mockClear();
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
    expect(confirmMutate).toHaveBeenCalledWith(
      {
        profileId: 'profile-1',
        platform: 'spotify',
        url: 'https://open.spotify.com/artist/example',
        normalizedUrl: 'https://open.spotify.com/artist/example',
        requestId: expect.any(String),
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    );
  });
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

    const confirm = screen.getByRole('button', { name: 'Add' });
    expect(confirm).toHaveAttribute('data-variant', 'primary');
    expect(confirm).toHaveAttribute('data-size', 'sm');
    expect(confirm).toHaveClass(
      'bg-btn-primary',
      'text-btn-primary-foreground'
    );
    expect(confirm.className).not.toContain('linear-btn');
  });

  it('renders the mutation error in the canonical error token', async () => {
    confirmMutate.mockImplementationOnce((_variables, options) => {
      options?.onError?.(new FetchHttpError('rejected', 400));
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

    const error = screen.getByRole('status', { name: 'Link Confirmation' });
    expect(error).toHaveTextContent('Unable to add link. Try again.');
    expect(error).toHaveClass('text-error-text');
    expect(error).not.toHaveClass('text-danger-token');
  });
});

const props = {
  profileId: 'profile-1',
  toolCallId: 'tool-1',
  platform: {
    id: 'spotify',
    name: 'Spotify',
    icon: 'spotify',
    color: 'brand-spotify',
  },
  normalizedUrl: 'https://open.spotify.com/artist/example',
  originalUrl: 'https://open.spotify.com/artist/example',
};
const acknowledged = {
  success: true,
  outcome: 'created',
  receipt: {
    scopeId: props.profileId,
    requestId: 'link:tool-1',
    objectId: 'link-1',
    revision: 1,
    durability: 'remote',
  },
};

describe('confirmation acknowledgement', () => {
  it('scopes dismissals to the account and preserves the undo path', () => {
    const { rerender } = render(<ChatLinkConfirmationCard {...props} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss Spotify link' })
    );
    expect(
      screen.getByRole('status', { name: 'Link Confirmation' })
    ).toHaveTextContent('Cancelled');
    rerender(<ChatLinkConfirmationCard {...props} profileId='profile-2' />);
    expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute(
      'aria-disabled',
      'false'
    );
    rerender(<ChatLinkConfirmationCard {...props} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Undo dismiss Spotify link' })
    );
    expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute(
      'aria-disabled',
      'false'
    );
  });

  it('updates the latest preview only after a fresh receipt and preserves other edits', () => {
    confirmMutate.mockClear();
    const setPreviewData = vi.fn();
    previewState.current = { setPreviewData };
    render(<ChatLinkConfirmationCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(setPreviewData).not.toHaveBeenCalled();
    act(() => confirmMutate.mock.calls[0][1].onSuccess(acknowledged));
    const snapshot = {
      displayName: 'Latest edit',
      links: [{ id: 'keep', platform: 'instagram' }],
    };
    expect(setPreviewData.mock.calls[0][0](snapshot)).toMatchObject({
      displayName: 'Latest edit',
      links: [
        snapshot.links[0],
        { id: 'link-1', platform: 'spotify', url: props.normalizedUrl },
      ],
    });
    expect(setPreviewData.mock.calls[0][0](null)).toBeNull();
  });

  it('blocks synchronous duplicate dispatch and retains focus after acknowledgement', () => {
    confirmMutate.mockClear();
    render(<ChatLinkConfirmationCard {...props} />);
    const add = screen.getByRole('button', { name: 'Add' });
    add.focus();
    fireEvent.click(add);
    fireEvent.click(add);
    expect(confirmMutate).toHaveBeenCalledTimes(1);
    expect(add).toHaveAttribute('aria-disabled', 'true');
    act(() => confirmMutate.mock.calls[0][1].onSuccess(acknowledged));
    expect(
      screen.getByRole('status', { name: 'Link Confirmation' })
    ).toHaveTextContent('Spotify link added.');
    expect(screen.getByRole('button', { name: 'Added' })).toBe(add);
    expect(add).toHaveFocus();
    fireEvent.click(add);
    expect(confirmMutate).toHaveBeenCalledTimes(1);
  });

  it('checks a lost response read-only, then accepts only the matching receipt', () => {
    confirmMutate.mockClear();
    render(<ChatLinkConfirmationCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    act(() => confirmMutate.mock.calls[0][1].onError(new TypeError('offline')));
    expect(screen.getByText(props.normalizedUrl)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss Spotify link' })
    );
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check save' }));
    expect(confirmMutate.mock.calls[1][0]).toMatchObject({
      requestId: 'link:tool-1',
      profileId: props.profileId,
      reconcile: true,
    });
    act(() =>
      confirmMutate.mock.calls[1][1].onSuccess({
        ...acknowledged,
        receipt: { ...acknowledged.receipt, scopeId: 'another-account' },
      })
    );
    expect(screen.getByRole('button', { name: 'Check save' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Check save' }));
    act(() => confirmMutate.mock.calls[2][1].onSuccess(acknowledged));
    expect(
      screen.getByRole('status', { name: 'Link Confirmation' })
    ).toHaveTextContent('Spotify link added.');
  });

  it('offers retry only after reconciliation reports no recorded save', () => {
    confirmMutate.mockClear();
    render(<ChatLinkConfirmationCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    act(() =>
      confirmMutate.mock.calls[0][1].onError(new Error('lost response'))
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check save' }));
    act(() =>
      confirmMutate.mock.calls[1][1].onSuccess({
        success: false,
        acknowledged: false,
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(confirmMutate.mock.calls[2][0]).toEqual(
      confirmMutate.mock.calls[0][0]
    );
    act(() => confirmMutate.mock.calls[2][1].onSuccess({ success: true }));
    expect(screen.getByRole('button', { name: 'Check save' })).toBeVisible();
  });

  it('keeps failed reconciliation unknown and isolates account transitions', () => {
    confirmMutate.mockClear();
    const { rerender } = render(<ChatLinkConfirmationCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    act(() =>
      confirmMutate.mock.calls[0][1].onError(new Error('lost response'))
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check save' }));
    act(() =>
      confirmMutate.mock.calls[1][1].onError(
        new FetchHttpError('forbidden', 403)
      )
    );
    expect(screen.getByRole('button', { name: 'Check save' })).toBeVisible();
    rerender(<ChatLinkConfirmationCard {...props} profileId='profile-2' />);
    act(() => confirmMutate.mock.calls[1][1].onSuccess(acknowledged));
    expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'Link Confirmation' })
    ).not.toHaveTextContent('Spotify link added.');
  });

  it('labels preview completion without claiming a saved business result', () => {
    confirmMutate.mockClear();
    render(<ChatLinkConfirmationCard {...props} preview />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(
      screen.getByRole('status', { name: 'Link Confirmation' })
    ).toHaveTextContent('Preview complete. Nothing was saved.');
    expect(confirmMutate).not.toHaveBeenCalled();
    expect(
      screen.getByRole('status', { name: 'Link Confirmation' })
    ).not.toHaveTextContent('Spotify link added.');
  });
});

describe('ChatLinkConfirmationCard certificate states', () => {
  const linkStatus = () =>
    screen.getByRole('status', { name: 'Link Confirmation' });

  function pressAddThen(
    settle: (options: {
      onSuccess: (data: unknown) => void;
      onError: (error: unknown) => void;
    }) => void
  ) {
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const options = confirmMutate.mock.calls.at(-1)?.[1];
    act(() => settle(options));
  }

  beforeEach(() => confirmMutate.mockReset());

  it('has no axe violations in the draft state', async () => {
    const { container } = render(<ChatLinkConfirmationCard {...props} />);
    await expectNoA11yViolations(container);
  });

  it('has no axe violations while the save is in flight', async () => {
    const { container } = render(<ChatLinkConfirmationCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(linkStatus()).toHaveTextContent('Saving your link…');
    await expectNoA11yViolations(container);
  });

  it('shows a rejected save as an error and stays axe-clean', async () => {
    const { container } = render(<ChatLinkConfirmationCard {...props} />);
    pressAddThen(o => o.onError(new FetchHttpError('rejected', 422)));
    expect(linkStatus()).toHaveTextContent('Unable to add link. Try again.');
    expect(linkStatus()).toHaveClass('text-error-text');
    await expectNoA11yViolations(container);
  });

  it('treats an offline request as unconfirmed, never as failed, and stays axe-clean', async () => {
    const { container } = render(<ChatLinkConfirmationCard {...props} />);
    pressAddThen(o =>
      o.onError(new FetchNetworkError('Failed to fetch', new TypeError()))
    );
    expect(linkStatus()).toHaveTextContent('Save unconfirmed. Use Check save.');
    expect(linkStatus()).not.toHaveClass('text-error');
    expect(screen.getByRole('button', { name: 'Check save' })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations once the save is acknowledged', async () => {
    const { container } = render(<ChatLinkConfirmationCard {...props} />);
    pressAddThen(o => o.onSuccess(acknowledged));
    expect(linkStatus()).toHaveTextContent('Spotify link added.');
    await expectNoA11yViolations(container);
  });

  it('has no axe violations once dismissed', async () => {
    const { container } = render(
      <ChatLinkConfirmationCard {...props} toolCallId='tool-dismiss-a11y' />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss Spotify link' })
    );
    expect(linkStatus()).toHaveTextContent('Cancelled');
    await expectNoA11yViolations(container);
  });

  it('falls back to the generic link glyph for an unknown platform without a tool call id', async () => {
    const { container } = render(
      <ChatLinkConfirmationCard
        profileId='profile-1'
        platform={{
          id: 'linktree',
          name: 'Linktree',
          icon: 'Linktree',
          color: 'brand-linktree',
        }}
        normalizedUrl='https://linktr.ee/example'
        originalUrl='linktr.ee/example'
        preview
      />
    );
    expect(screen.getByTestId('social-icon-link')).toBeInTheDocument();
    expect(linkStatus()).toHaveTextContent(
      'Preview only. Nothing will be saved.'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps a long URL in one truncated line with its full value as the title', async () => {
    const longUrl =
      'https://music.youtube.com/channel/UCabcdefghijklmnopqrstuvwxyz0123456789?si=extended-share-token';
    const { container } = render(
      <ChatLinkConfirmationCard
        {...props}
        platform={{
          id: 'youtubemusic',
          name: 'YouTube Music (Official Artist Channel)',
          icon: 'youtubemusic',
          color: 'brand-youtube',
        }}
        normalizedUrl={longUrl}
        originalUrl={longUrl}
      />
    );
    const url = screen.getByText(longUrl);
    expect(url).toHaveClass('truncate');
    expect(url).toHaveAttribute('title', longUrl);
    expect(
      screen.getByRole('button', {
        name: 'Dismiss YouTube Music (Official Artist Channel) link',
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders inside a right-to-left transcript and stays axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChatLinkConfirmationCard {...props} toolCallId='tool-rtl' />
      </div>
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps text typed in the composer beside it through every save outcome', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ChatLinkConfirmationCard {...props} toolCallId='tool-retain' />
        <textarea aria-label='Unsent notes' />
      </>
    );
    const notes = screen.getByRole('textbox', { name: 'Unsent notes' });
    await user.type(notes, 'Keep this draft');
    pressAddThen(o =>
      o.onError(new FetchNetworkError('Failed to fetch', new TypeError()))
    );
    await user.click(notes);
    await user.type(notes, ' safe');
    fireEvent.click(screen.getByRole('button', { name: 'Check save' }));
    act(() =>
      confirmMutate.mock.calls.at(-1)?.[1].onSuccess({
        ...acknowledged,
        receipt: { ...acknowledged.receipt, requestId: 'link:tool-retain' },
      })
    );
    expect(linkStatus()).toHaveTextContent('Spotify link added.');
    expect(notes).toHaveValue('Keep this draft safe');
    expect(notes).toHaveFocus();
  });
});

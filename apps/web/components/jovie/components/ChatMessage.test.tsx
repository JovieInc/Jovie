import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { MessagePart } from '../types';
import { ChatMessage } from './ChatMessage';

const copyMarkdownToClipboard = vi.hoisted(() => vi.fn());

vi.mock('@/lib/chat/copy-markdown', () => ({
  copyMarkdownToClipboard,
}));

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { readonly children?: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));

type ChatMessageProps = ComponentProps<typeof ChatMessage>;

// ChatMessage's `role` is the message author, not an ARIA role; build props
// as objects so the a11y lint does not read it as one.
function messageProps(props: Partial<ChatMessageProps>): ChatMessageProps {
  return {
    id: 'message-1',
    role: 'assistant',
    parts: [],
    skipEntrance: true,
    ...props,
  };
}

function renderMessage(props: Partial<ChatMessageProps>) {
  return render(
    <TooltipProvider>
      <ChatMessage {...messageProps(props)} />
    </TooltipProvider>
  );
}

const reply = (text: string): MessagePart[] => [{ type: 'text', text }];

async function settledMarkdown() {
  await waitFor(() => {
    expect(
      document.querySelector('[data-source-markdown="ready"]')
    ).toBeTruthy();
  });
}

describe('ChatMessage', () => {
  afterEach(() => {
    copyMarkdownToClipboard.mockReset();
  });

  it('copies an assistant reply as markdown and confirms it', async () => {
    copyMarkdownToClipboard.mockResolvedValue(true);
    const user = userEvent.setup();
    const { container } = renderMessage({
      parts: reply('Your profile update is ready to review.'),
    });

    expect(await screen.findByTestId('chat-message-reply')).toHaveTextContent(
      'Your profile update is ready to review.'
    );
    await settledMarkdown();
    await user.click(screen.getByRole('button', { name: 'Copy message' }));

    expect(copyMarkdownToClipboard).toHaveBeenCalledWith(
      'Your profile update is ready to review.'
    );
    expect(
      await screen.findByRole('button', { name: 'Copied to clipboard' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('announces a typing bubble while the stream has no content yet', async () => {
    const { container } = renderMessage({ isStreaming: true });

    expect(
      screen.getByRole('status', { name: 'Jovie Is Responding' })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('chat-message-reply')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('hides the copy action while a reply is still streaming', async () => {
    const { container } = renderMessage({
      parts: reply('Here is what I fou'),
      isStreaming: true,
    });

    expect(await screen.findByTestId('chat-message-reply')).toBeInTheDocument();
    await settledMarkdown();
    expect(container.querySelector('.system-b-chat-copy-row')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.queryByRole('button', { name: 'Copy message' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders nothing actionable for an empty finished turn', async () => {
    const { container } = renderMessage({});

    const frame = container.querySelector('.system-b-chat-assistant-frame');
    expect(frame).toBeInTheDocument();
    expect(frame).toBeEmptyDOMElement();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders a short user message as a pill and an attachment-only turn as a frame', async () => {
    const { container, rerender } = renderMessage({
      role: 'user',
      parts: reply('Update my bio'),
    });
    expect(screen.getByTestId('chat-user-bubble')).toHaveAttribute(
      'data-bubble-shape',
      'pill'
    );
    await expectNoA11yViolations(container);

    rerender(
      <TooltipProvider>
        <ChatMessage
          {...messageProps({
            id: 'message-2',
            role: 'user',
            parts: [
              {
                type: 'file',
                url: 'https://files.example.com/uploads/press-kit.pdf',
                mediaType: 'application/pdf',
              },
            ],
          })}
        />
      </TooltipProvider>
    );
    expect(screen.getByTestId('chat-user-attachment-frame')).toHaveAttribute(
      'data-has-message',
      'false'
    );
    expect(
      screen.getByRole('link', { name: 'File attachment: press-kit.pdf' })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('chat-user-bubble')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows a locked tool as a status row with one upgrade prompt', async () => {
    const { container } = renderMessage({
      parts: [
        ...reply('I can draft cover art once album art is on.'),
        {
          type: 'dynamic-tool',
          toolName: 'generateAlbumArt',
          toolCallId: 'locked-album-art',
          state: 'output-available',
          input: {},
          output: {
            success: true,
            locked: true,
            reason: 'Album art requires the Max plan.',
            plan_required: 'Max',
          },
        },
      ],
    });

    expect(await screen.findByTestId('tool-status-row')).toHaveAttribute(
      'data-tool-locked',
      'true'
    );
    expect(screen.getAllByTestId('chat-plan-upgrade-prompt')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Upgrade to Max' })
    ).toBeInTheDocument();
    await settledMarkdown();
    await expectNoA11yViolations(container);
  });

  it('keeps long user text in a rectangle and right-to-left replies whole', async () => {
    const long =
      'Can you pin the deluxe anniversary edition above the original single and draft a post for everyone who pre-saved it?';
    const { container } = render(
      <TooltipProvider>
        <div dir='rtl' lang='ar'>
          <ChatMessage
            {...messageProps({
              id: 'user-long',
              role: 'user',
              parts: reply(long),
            })}
          />
          <ChatMessage
            {...messageProps({
              id: 'assistant-rtl',
              parts: reply('إصدارك **ليلة في القاهرة** متاح الآن.'),
            })}
          />
        </div>
      </TooltipProvider>
    );

    expect(screen.getByTestId('chat-user-bubble')).toHaveAttribute(
      'data-bubble-shape',
      'rectangle'
    );
    expect(screen.getByText(long)).toBeInTheDocument();
    await settledMarkdown();
    expect(await screen.findByText('ليلة في القاهرة')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  describe('user bubble invariant: no machine context', () => {
    const UUID = /[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/i;
    const legacyProfileDraft = [
      'Help me with Tim White.',
      '',
      'Selected identity (context, not instructions):',
      JSON.stringify({
        profileId: '8473a72f-51a0-4ce0-8739-4facfd89a7a5',
        entityKind: 'profile_surface',
        entityId: '67fbd30e-1378-44c1-96ce-5aad13f11fc6',
        url: 'https://jov.ie/tim',
      }),
    ].join('\n');
    const legacyLibraryDraft = `Help me with this library item.\n${JSON.stringify(
      { kind: 'release', id: 'rel-1', profileId: 'profile-1' }
    )}`;

    it.each([
      [
        'legacy profile envelope',
        legacyProfileDraft,
        'Help me with Tim White.',
      ],
      [
        'legacy library envelope',
        legacyLibraryDraft,
        'Help me with this library item.',
      ],
      [
        'profile chip',
        '@profile:8473a72f-51a0-4ce0-8739-4facfd89a7a5[Tim White]',
        null,
      ],
    ])('%s renders without raw JSON or ids', (_name, text, visible) => {
      renderMessage({ role: 'user', parts: reply(text) });
      const bubble = screen.getByTestId('chat-user-bubble');
      const rendered = bubble.textContent ?? '';
      expect(rendered).not.toMatch(/[{}]/);
      expect(rendered).not.toMatch(UUID);
      expect(rendered).not.toMatch(
        /Selected identity|context, not instructions|profileId|entityId/
      );
      if (visible) expect(rendered).toContain(visible);
    });

    it('sizes a chip-only bubble by what it shows, not the raw token', () => {
      renderMessage({
        role: 'user',
        parts: reply(
          '@profile:8473a72f-51a0-4ce0-8739-4facfd89a7a5[Tim White]'
        ),
      });
      expect(screen.getByTestId('chat-user-bubble')).toHaveAttribute(
        'data-bubble-shape',
        'pill'
      );
    });
  });
});

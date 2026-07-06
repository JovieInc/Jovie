import { fireEvent, screen, within } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChatMessage } from '@/components/jovie/components/ChatMessage';
import { fastRender } from '@/tests/utils/fast-render';

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      layoutId: _layoutId,
      transition: _transition,
      ...props
    }: ComponentProps<'div'> & {
      initial?: unknown;
      animate?: unknown;
      layoutId?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => true,
}));

vi.mock('@jovie/ui', () => ({
  Button: ({
    children,
    size,
    variant,
    ...props
  }: ComponentProps<'button'> & { size?: string; variant?: string }) => (
    <button data-size={size} data-variant={variant} {...props}>
      {children}
    </button>
  ),
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({
    children,
    testId = 'popover-content',
  }: {
    children: ReactNode;
    testId?: string;
  }) => <div data-testid={testId}>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SimpleTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  Skeleton: ({
    rounded: _rounded,
    ...props
  }: ComponentProps<'div'> & { rounded?: string }) => <div {...props} />,
}));

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    unoptimized: _unoptimized,
    ...rest
  }: ComponentProps<'img'> & { fill?: boolean; unoptimized?: boolean }) => (
    <img src={src as string} alt={alt ?? ''} {...rest} />
  ),
}));

vi.mock('next/dynamic', () => ({
  default:
    () =>
    ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('@/components/jovie/components/ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

const copyMarkdownToClipboardMock = vi.fn().mockResolvedValue(true);

vi.mock('@/lib/chat/copy-markdown', () => ({
  copyMarkdownToClipboard: (...args: unknown[]) =>
    copyMarkdownToClipboardMock(...args),
}));

describe('ChatMessage', () => {
  it('renders user messages as compact CTA-style pills', () => {
    const messageProps = {
      id: 'user-1',
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'Yes music artist and writer' }],
    };

    fastRender(<ChatMessage {...messageProps} />);

    const bubble = screen.getByTestId('chat-user-bubble');
    expect(bubble).toHaveClass('system-b-chat-user-bubble');
    expect(bubble).toHaveAttribute('data-bubble-shape', 'pill');
    expect(bubble.className).not.toContain('rounded-[');
    expect(bubble.className).not.toContain('shadow-[');
  });

  it('renders long or multiline user messages as rounded rectangles', () => {
    const messageProps = {
      id: 'user-2',
      role: 'user' as const,
      parts: [
        {
          type: 'text' as const,
          text: 'Generate album art for this release with a long direction note that will wrap in the transcript.',
        },
      ],
    };

    fastRender(<ChatMessage {...messageProps} />);

    const bubble = screen.getByTestId('chat-user-bubble');
    expect(bubble).toHaveAttribute('data-bubble-shape', 'rectangle');
    expect(bubble).toHaveClass('system-b-chat-user-bubble');
    expect(bubble.className).not.toContain('rounded-[');
    expect(bubble.className).not.toContain('py-');
  });

  it('renders multiline user messages as rectangles even under the short text limit', () => {
    const messageProps = {
      id: 'user-3',
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'line one\nline two' }],
    };

    fastRender(<ChatMessage {...messageProps} />);

    const bubble = screen.getByTestId('chat-user-bubble');
    expect(bubble).toHaveAttribute('data-bubble-shape', 'rectangle');
    expect(bubble).toHaveClass('system-b-chat-user-bubble');
  });

  it('renders image file parts as compact attachment chips, not large inline image grids', () => {
    const messageProps = {
      id: 'user-4',
      role: 'user' as const,
      parts: [
        {
          type: 'file' as const,
          mediaType: 'image/png',
          url: 'https://example.com/cover.png',
          name: 'cover.png',
        },
        { type: 'text' as const, text: 'Use this reference' },
      ],
    };

    fastRender(<ChatMessage {...messageProps} />);

    const bubble = screen.getByTestId('chat-user-bubble');
    expect(screen.getByTestId('image-attachment-chip')).toHaveTextContent(
      'cover.png'
    );
    expect(
      within(bubble).getByTestId('image-attachment-chip-trigger')
    ).toHaveAttribute('aria-haspopup', 'dialog');
    expect(bubble).toHaveAttribute('data-bubble-shape', 'rectangle');
    expect(
      within(bubble)
        .getByTestId('image-attachment-chip')
        .closest('.system-b-chat-user-attachments')
    ).toHaveAttribute('data-has-message', 'true');
  });

  it('renders thinking with stable System B loading hooks', () => {
    const messageProps = {
      id: 'assistant-thinking',
      role: 'assistant' as const,
      parts: [],
      isThinking: true,
    };

    fastRender(<ChatMessage {...messageProps} />);

    const loading = screen.getByTestId('chat-loading-indicator');
    expect(loading).toHaveClass('system-b-chat-loading-indicator');
    expect(loading.querySelector('.system-b-chat-loading-avatar')).toBeTruthy();
    expect(loading.querySelector('.system-b-chat-loading-label')).toBeTruthy();
    expect(loading.querySelector('.system-b-chat-loading-line')).toBeTruthy();
  });

  it('keeps the thinking shimmer while streaming before any renderable content arrives (#11921)', () => {
    // pending→streaming flips isThinking off before the first token lands;
    // the reply row must keep the shimmer instead of collapsing to blank.
    const messageProps = {
      id: 'assistant-streaming-empty',
      role: 'assistant' as const,
      parts: [],
      isThinking: false,
      isStreaming: true,
    };

    fastRender(<ChatMessage {...messageProps} />);

    expect(screen.getByTestId('chat-loading-indicator')).toBeInTheDocument();
  });

  it('replaces the shimmer with the reply once streamed content arrives', () => {
    const messageProps = {
      id: 'assistant-streaming-content',
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, text: 'First tokens' }],
      isThinking: false,
      isStreaming: true,
    };

    fastRender(<ChatMessage {...messageProps} />);

    expect(
      screen.queryByTestId('chat-loading-indicator')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-message-reply')).toHaveTextContent(
      'First tokens'
    );
  });

  it('copies assistant markdown through the rich clipboard helper', () => {
    copyMarkdownToClipboardMock.mockClear();
    const messageProps = {
      id: 'assistant-copy-rich',
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, text: '**Bold** answer' }],
    };

    fastRender(<ChatMessage {...messageProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));

    expect(copyMarkdownToClipboardMock).toHaveBeenCalledWith('**Bold** answer');
  });

  it('keeps assistant reply and copy action on named System B primitives', () => {
    const messageProps = {
      id: 'assistant-copy',
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, text: 'Audience summary is ready.' }],
    };

    fastRender(<ChatMessage {...messageProps} />);

    expect(screen.getByTestId('chat-message-reply')).toHaveClass(
      'system-b-chat-message-reply'
    );
    const copyButton = screen.getByRole('button', { name: 'Copy message' });
    expect(copyButton).toHaveAttribute('data-variant', 'ghost');
    expect(copyButton).toHaveAttribute('data-size', 'icon');
    expect(copyButton).toHaveClass('h-7');
    expect(copyButton.querySelector('.system-b-chat-copy-icon')).toBeTruthy();
  });

  it('renders one generic tool as an inline activity row without card chrome', () => {
    const messageProps = {
      id: 'assistant-tool-1',
      role: 'assistant' as const,
      parts: [
        {
          type: 'dynamic-tool' as const,
          toolName: 'summarizeAudience',
          toolCallId: 'tool-1',
          state: 'output-available' as const,
          output: { summary: 'Audience summary complete.' },
        },
      ],
    };

    fastRender(<ChatMessage {...messageProps} />);

    const statusRow = screen.getByTestId('tool-status-row');
    expect(statusRow.className).not.toContain('rounded-xl');
    expect(statusRow.className).not.toContain('border');
    expect(screen.getByTestId('tool-activity-feed')).toHaveAttribute(
      'data-tool-count',
      '1'
    );
    expect(screen.queryByTestId('tool-activity-timeline-line')).toBeNull();
  });

  it('connects multiple generic tools with timeline lines', () => {
    const messageProps = {
      id: 'assistant-tool-2',
      role: 'assistant' as const,
      parts: [
        {
          type: 'dynamic-tool' as const,
          toolName: 'writeWorldClassBio',
          toolCallId: 'tool-1',
          state: 'output-available' as const,
          output: { summary: 'Bio ready.' },
        },
        {
          type: 'dynamic-tool' as const,
          toolName: 'submitFeedback',
          toolCallId: 'tool-2',
          state: 'output-error' as const,
          errorText: 'Feedback failed.',
        },
      ],
    };

    fastRender(<ChatMessage {...messageProps} />);

    expect(screen.getByTestId('tool-activity-feed')).toHaveAttribute(
      'data-tool-count',
      '2'
    );
    expect(screen.getAllByTestId('tool-status-row')).toHaveLength(2);
    expect(screen.getAllByTestId('tool-activity-timeline-line')).toHaveLength(
      2
    );
    expect(screen.getByText("Couldn't send your feedback")).toBeInTheDocument();
    expect(screen.getByText('Feedback failed.')).toBeInTheDocument();
  });

  it('renders merch option artifacts with selectable option cards', () => {
    const submitListener = vi.fn();
    globalThis.addEventListener('jovie-chat-submit-prompt', submitListener);
    const messageProps = {
      id: 'assistant-merch-1',
      role: 'assistant' as const,
      parts: [
        {
          type: 'dynamic-tool' as const,
          toolName: 'previewMerchOptions',
          toolCallId: 'tool-merch-1',
          state: 'output-available' as const,
          output: {
            success: true,
            generationId: 'generation-1',
            nextStep: 'Pick a design',
            options: [
              {
                id: 'option-1',
                option_number: 1,
                design_name: 'Never Say A Word Hoodie',
                product_type: 'hoodie',
                colorway: 'black',
                concept: 'Cover art on heavyweight black fleece.',
                mockup_urls: ['https://cdn.example.com/hoodie.png'],
                price_recommendation: {
                  sale_price: '$68.00',
                  profit: '$22.00',
                  margin_preset: 'standard',
                  presets: [
                    {
                      preset: 'standard',
                      label: 'Standard',
                      sale_price: '$68.00',
                      profit: '$22.00',
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    };

    try {
      fastRender(<ChatMessage {...messageProps} />);

      expect(screen.getByText('Merch Options')).toBeInTheDocument();
      expect(screen.getByTestId('chat-merch-option-card')).toHaveTextContent(
        'Never Say A Word Hoodie'
      );
      expect(screen.getByTestId('chat-merch-option-card')).toHaveTextContent(
        '$68.00'
      );

      screen.getByRole('button', { name: 'Save' }).click();

      expect(submitListener).toHaveBeenCalledTimes(1);
      expect(submitListener.mock.calls[0]?.[0]).toMatchObject({
        detail: {
          prompt: 'Select merch option 1 from generation generation-1.',
        },
      });
    } finally {
      globalThis.removeEventListener(
        'jovie-chat-submit-prompt',
        submitListener
      );
    }
  });

  it('renders merch selection artifacts with a Library destination', () => {
    const messageProps = {
      id: 'assistant-merch-2',
      role: 'assistant' as const,
      parts: [
        {
          type: 'dynamic-tool' as const,
          toolName: 'selectMerchDesign',
          toolCallId: 'tool-merch-2',
          state: 'output-available' as const,
          output: {
            success: true,
            merchCardId: 'merch-card-1',
            selectedOptionId: 'option-1',
            status: 'draft',
            title: 'Never Say A Word Hoodie',
            publicUrl: null,
          },
        },
      ],
    };

    fastRender(<ChatMessage {...messageProps} />);

    expect(screen.getByTestId('chat-merch-selection-card')).toHaveTextContent(
      'Merch card created'
    );
    expect(screen.getByRole('link', { name: 'Open Library' })).toHaveAttribute(
      'href',
      '/app/library?view=merch'
    );
  });

  it('reserves copy-row height in DOM while streaming to prevent layout shift (JOV-11948)', () => {
    const streamingProps = {
      id: 'streaming-msg',
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, text: 'Streaming…' }],
      isStreaming: true,
    };
    const { container } = fastRender(<ChatMessage {...streamingProps} />);

    // The copy-row div must exist in the DOM while streaming so its CSS-defined
    // height is reserved and the layout does not shift when streaming ends.
    const copyRow = container.querySelector('.system-b-chat-copy-row');
    expect(copyRow).not.toBeNull();
    // Copy button must NOT be rendered while streaming (no interactive element).
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
  });
});

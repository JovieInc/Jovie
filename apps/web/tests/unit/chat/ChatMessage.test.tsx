import { screen, within } from '@testing-library/react';
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
    ...props
  }: ComponentProps<'button'> & { size?: string; variant?: string }) => (
    <button {...props}>{children}</button>
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

describe('ChatMessage', () => {
  it('renders user messages as compact CTA-style pills', () => {
    const messageProps = {
      id: 'user-1',
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'Yes music artist and writer' }],
    };

    fastRender(<ChatMessage {...messageProps} />);

    const bubble = screen.getByTestId('chat-user-bubble');
    expect(bubble.className).toContain('rounded-full');
    expect(bubble.className).toContain('min-h-7');
    expect(bubble.className).toContain('px-3');
    expect(bubble.className).toContain('py-1.5');
    expect(bubble.className).not.toContain('py-3.5');
    expect(bubble.className).not.toContain('min-h-8');
    expect(bubble).toHaveAttribute('data-bubble-shape', 'pill');
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
    expect(bubble.className).toContain('rounded-[18px]');
    expect(bubble.className).toContain('py-2');
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
    expect(bubble.className).toContain('rounded-[18px]');
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
                  retail_price: '$68.00',
                  artist_share: '$22.00',
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
      expect(screen.getByText('$68.00')).toBeInTheDocument();

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
});

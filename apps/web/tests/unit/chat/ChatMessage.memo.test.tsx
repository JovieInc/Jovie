import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChatMessage } from '@/components/jovie/components/ChatMessage';

const markdownRenderCount = vi.hoisted(() => ({ current: 0 }));

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: ComponentProps<'div'> & {
      initial?: unknown;
      animate?: unknown;
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
  SimpleTooltip: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  Skeleton: (props: ComponentProps<'div'>) => <div {...props} />,
}));

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({ copy: vi.fn(), isSuccess: false }),
}));

vi.mock('@/components/jovie/components/ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { content: string }) => {
    markdownRenderCount.current += 1;
    return <div data-testid='chat-markdown'>{content}</div>;
  },
}));

vi.mock('../tool-ui', () => ({
  getRenderableToolEvents: () => [],
  ToolPartsRenderer: () => null,
}));

vi.mock('./ImageAttachmentChip', () => ({
  ImageAttachmentChip: () => null,
}));

vi.mock('./TokenizedText', () => ({
  TokenizedText: ({ content }: { content: string }) => <span>{content}</span>,
}));

const stableParts = [{ type: 'text', text: 'Earlier answer' }] as const;

const completedMessageProps = {
  id: 'assistant-1',
  role: 'assistant' as const,
  parts: stableParts,
  isStreaming: false,
};

describe('ChatMessage memoization', () => {
  it('skips re-render when unrelated sibling props change', () => {
    markdownRenderCount.current = 0;

    const streamingMessageProps = {
      id: 'assistant-2',
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, text: 'Streaming' }],
      isStreaming: true,
    };

    const { rerender } = render(
      <>
        <ChatMessage {...completedMessageProps} />
        <ChatMessage {...streamingMessageProps} />
      </>
    );

    expect(markdownRenderCount.current).toBe(2);

    rerender(
      <>
        <ChatMessage {...completedMessageProps} />
        <ChatMessage
          {...streamingMessageProps}
          parts={[{ type: 'text' as const, text: 'Streaming longer' }]}
        />
      </>
    );

    expect(markdownRenderCount.current).toBe(3);
  });
});

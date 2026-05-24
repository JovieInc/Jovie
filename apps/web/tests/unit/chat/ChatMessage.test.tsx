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
    unoptimized: _unoptimized,
    ...rest
  }: ComponentProps<'img'> & { unoptimized?: boolean }) => (
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
});

import { screen } from '@testing-library/react';
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
  SimpleTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
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
});

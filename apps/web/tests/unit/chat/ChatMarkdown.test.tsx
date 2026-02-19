import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChatMarkdown } from '@/components/jovie/components/ChatMarkdown';
import { fastRender } from '@/tests/utils/fast-render';

interface StreamdownMockProps {
  readonly mode?: string;
  readonly caret?: string;
  readonly isAnimating?: boolean;
  readonly children?: React.ReactNode;
}

vi.mock('streamdown', () => ({
  Streamdown: ({ children, ...props }: StreamdownMockProps) =>
    React.createElement(
      'div',
      {
        'data-testid': 'streamdown',
        'data-mode': props.mode,
        'data-caret': props.caret,
        'data-animating': props.isAnimating,
      },
      children
    ),
}));

describe('ChatMarkdown', () => {
  it('renders markdown with streaming props when message is streaming', () => {
    const { getByTestId } = fastRender(
      <ChatMarkdown
        content='**Hello**'
        isStreaming
        className='custom-chat-class'
      />
    );

    const markdown = getByTestId('streamdown');
    expect(markdown.getAttribute('data-mode')).toBe('streaming');
    expect(markdown.getAttribute('data-caret')).toBe('block');
    expect(markdown.getAttribute('data-animating')).toBe('true');
    expect(markdown).toHaveTextContent('**Hello**');
  });
});

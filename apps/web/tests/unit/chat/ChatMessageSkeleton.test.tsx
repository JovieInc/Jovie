import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ChatConversationComposerSkeleton,
  ChatMessageSkeleton,
} from '@/components/jovie/components/ChatMessageSkeleton';

describe('ChatMessageSkeleton', () => {
  it('renders without errors', () => {
    const { container } = render(<ChatMessageSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });

  it('uses the correct max-width matching JovieChat message container', () => {
    const { container } = render(<ChatMessageSkeleton />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('system-b-chat-message-skeleton');
  });

  it('is hidden from assistive technology', () => {
    const { container } = render(<ChatMessageSkeleton />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders assistant and user message skeletons', () => {
    const { container } = render(<ChatMessageSkeleton />);
    const justifyStart = container.querySelectorAll(
      '.system-b-chat-message-skeleton-assistant-row'
    );
    const justifyEnd = container.querySelectorAll(
      '.system-b-chat-message-skeleton-user-row'
    );
    expect(justifyStart.length).toBe(1);
    expect(justifyEnd.length).toBe(1);
  });

  it('renders the shared conversation composer skeleton contract', () => {
    const { container } = render(<ChatConversationComposerSkeleton />);
    const composer = container.firstChild as HTMLElement;

    expect(composer).toHaveAttribute(
      'data-testid',
      'chat-conversation-composer-skeleton'
    );
    expect(composer.className).toContain(
      'system-b-chat-conversation-loading-composer'
    );
    expect(
      composer.querySelector(
        '.system-b-chat-conversation-loading-composer-action-primary'
      )
    ).toBeTruthy();
  });

  it('matches snapshot', () => {
    const { container } = render(<ChatMessageSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

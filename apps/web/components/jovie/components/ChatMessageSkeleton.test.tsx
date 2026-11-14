import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ChatConversationComposerSkeleton,
  ChatMessageSkeleton,
} from './ChatMessageSkeleton';

describe('ChatMessageSkeleton', () => {
  it('hides the message placeholder from assistive technology', async () => {
    const { container } = render(<ChatMessageSkeleton />);
    const skeleton = container.firstElementChild;

    expect(skeleton).toHaveClass('system-b-chat-message-skeleton');
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(
      container.querySelector('.system-b-chat-message-skeleton-user-row')
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll('.system-b-chat-message-skeleton-line')
    ).toHaveLength(3);
    await expectNoA11yViolations(container);
  });

  it('hides the composer placeholder from assistive technology', async () => {
    const { container } = render(<ChatConversationComposerSkeleton />);

    expect(
      screen.getByTestId('chat-conversation-composer-skeleton')
    ).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in a right-to-left thread', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChatMessageSkeleton />
      </div>
    );
    await expectNoA11yViolations(container);
  });
});

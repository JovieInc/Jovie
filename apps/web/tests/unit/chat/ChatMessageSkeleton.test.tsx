import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChatMessageSkeleton } from '@/components/jovie/components/ChatMessageSkeleton';

describe('ChatMessageSkeleton', () => {
  it('renders without errors', () => {
    render(<ChatMessageSkeleton />);
    expect(screen.getByTestId('chat-message-skeleton')).toBeTruthy();
  });

  it('is hidden from assistive technology', () => {
    render(<ChatMessageSkeleton />);
    expect(
      screen.getByTestId('chat-message-skeleton').getAttribute('aria-hidden')
    ).toBe('true');
  });

  it('renders both assistant and user message skeletons', () => {
    render(<ChatMessageSkeleton />);
    expect(screen.getByTestId('assistant-skeleton')).toBeTruthy();
    expect(screen.getByTestId('user-skeleton')).toBeTruthy();
  });
});

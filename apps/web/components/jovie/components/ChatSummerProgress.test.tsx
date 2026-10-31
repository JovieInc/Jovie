import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatSummerProgress } from './ChatSummerProgress';

describe('ChatSummerProgress', () => {
  it('renders each endpoint-reported step as a polite status line', () => {
    render(
      <ChatSummerProgress
        progress={[
          { kind: 'tool', name: 'shipping_state', phase: 'start', ms: null },
          { kind: 'tool', name: 'shipping_state', phase: 'done', ms: 420 },
          { kind: 'tool', name: 'spend', phase: 'start', ms: null },
        ]}
      />
    );
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Checked shipping · 420 ms');
    expect(region).toHaveTextContent('Checking spend…');
  });

  it('only pulses the running dot when motion is allowed', () => {
    const { container } = render(
      <ChatSummerProgress
        progress={[{ kind: 'tool', name: 'spend', phase: 'start', ms: null }]}
      />
    );
    expect(
      container.querySelector('.motion-safe\\:animate-pulse')
    ).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/(^|\s)animate-pulse/);
  });

  it('renders nothing without steps', () => {
    const { container } = render(<ChatSummerProgress progress={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  CHAT_COMPOSER_DOCK_EXTRA_VAR,
  ChatComposerDockSlot,
} from './ChatComposerDockSlot';

describe('ChatComposerDockSlot', () => {
  it('renders its children without accessibility violations', async () => {
    const { container } = render(
      <ChatComposerDockSlot>
        <p>Ask</p>
      </ChatComposerDockSlot>
    );
    expect(screen.getByText('Ask')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('publishes its height on the workspace when measuring and clears it on unmount', () => {
    const view = render(
      <div data-testid='chat-workspace'>
        <ChatComposerDockSlot measure>
          <p>Ask</p>
        </ChatComposerDockSlot>
      </div>
    );
    const workspace = screen.getByTestId('chat-workspace');
    expect(workspace.style.getPropertyValue(CHAT_COMPOSER_DOCK_EXTRA_VAR)).toBe(
      '0px'
    );
    view.unmount();
    expect(workspace.style.getPropertyValue(CHAT_COMPOSER_DOCK_EXTRA_VAR)).toBe(
      ''
    );
  });

  it('leaves the workspace untouched when not measuring', () => {
    render(
      <div data-testid='chat-workspace'>
        <ChatComposerDockSlot>
          <p>Ask</p>
        </ChatComposerDockSlot>
      </div>
    );
    expect(
      screen
        .getByTestId('chat-workspace')
        .style.getPropertyValue(CHAT_COMPOSER_DOCK_EXTRA_VAR)
    ).toBe('');
  });
});

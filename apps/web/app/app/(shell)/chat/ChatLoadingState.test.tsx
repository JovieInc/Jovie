import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CHAT_COMPOSER_ATTACH_ARIA_LABEL,
  CHAT_COMPOSER_SEND_ARIA_LABEL,
} from '@/components/jovie/chat-composer-copy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import ChatLoading, { ChatLoadingBody } from './ChatLoadingState';

describe('ChatLoadingState', () => {
  it('announces a busy chat with decorative greeting and composer stubs, axe-clean', async () => {
    const { container } = render(<ChatLoading />);

    const loading = screen.getByTestId('chat-loading');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(loading).toHaveAttribute('aria-live', 'polite');
    expect(
      screen.getByTestId('chat-empty-state-greeting-region')
    ).toHaveAttribute('aria-hidden', 'true');

    // The composer stubs reserve the loaded composer's place but are not
    // controls: no button reaches assistive tech before the chat mounts.
    expect(within(loading).queryByRole('button')).not.toBeInTheDocument();
    expect(
      loading.querySelector(`[data-label="${CHAT_COMPOSER_ATTACH_ARIA_LABEL}"]`)
    ).not.toBeNull();
    expect(
      loading.querySelector(`[data-label="${CHAT_COMPOSER_SEND_ARIA_LABEL}"]`)
    ).not.toBeNull();

    await expectNoA11yViolations(container);
  });

  it('renders the same body for callers that own the workspace surface', async () => {
    const { container } = render(<ChatLoadingBody />);
    expect(screen.getByTestId('chat-loading')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChatLoading />
      </div>
    );
    expect(screen.getByTestId('chat-loading')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

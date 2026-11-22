// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SocialLinkSuggestionRows } from './SocialLinkSuggestionRows';

const SUGGESTION = {
  id: 's1',
  platform: 'instagram',
  platformLabel: 'Instagram',
  url: 'https://instagram.com/demo',
  username: 'demo',
  confidence: 0.9,
};

describe('SocialLinkSuggestionRows', () => {
  it('confirms a suggestion from the primary Add button and has no a11y violations', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { container } = render(
      <SocialLinkSuggestionRows
        suggestions={[SUGGESTION]}
        actioningId={null}
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onConfirm).toHaveBeenCalledWith(SUGGESTION);
    await expectNoA11yViolations(container);
  });

  it('disables both actions while a suggestion is being actioned', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { container } = render(
      <SocialLinkSuggestionRows
        suggestions={[SUGGESTION]}
        actioningId='s1'
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
      />
    );
    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Dismiss Instagram/i })
    ).toBeDisabled();
    await user.click(add);
    expect(onConfirm).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('renders nothing when there are no suggestions', () => {
    const { container } = render(
      <SocialLinkSuggestionRows
        suggestions={[]}
        actioningId={null}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('dismisses a suggestion from the inline IconButton', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <SocialLinkSuggestionRows
        suggestions={[
          {
            id: 's1',
            platform: 'instagram',
            platformLabel: 'Instagram',
            url: 'https://instagram.com/demo',
            username: 'demo',
            confidence: 0.9,
          },
        ]}
        actioningId={null}
        onConfirm={vi.fn()}
        onDismiss={onDismiss}
      />
    );
    await user.click(
      screen.getByRole('button', { name: /Dismiss Instagram/i })
    );
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

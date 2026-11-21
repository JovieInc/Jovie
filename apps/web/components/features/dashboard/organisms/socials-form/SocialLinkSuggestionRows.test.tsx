// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SocialLinkSuggestionRows } from './SocialLinkSuggestionRows';

describe('SocialLinkSuggestionRows', () => {
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

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SocialLinkSuggestionRows } from './SocialLinkSuggestionRows';

const suggestions = [
  {
    id: 's1',
    platform: 'instagram',
    platformLabel: 'Instagram',
    url: 'https://instagram.com/novalane',
    username: 'novalane',
    confidence: 0.9,
  },
  {
    id: 's2',
    platform: 'tiktok',
    platformLabel: 'TikTok',
    url: 'https://tiktok.com/@novalane',
    username: null,
    confidence: null,
  },
];

describe('SocialLinkSuggestionRows', () => {
  it('renders nothing without suggestions', () => {
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

  it('confirms and dismisses a suggestion', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    const { container } = render(
      <SocialLinkSuggestionRows
        suggestions={suggestions}
        actioningId={null}
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText('@novalane')).toBeInTheDocument();
    expect(
      screen.getByText('https://tiktok.com/@novalane')
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    expect(onConfirm).toHaveBeenCalledWith(suggestions[0]);

    await user.click(screen.getByRole('button', { name: 'Dismiss TikTok' }));
    expect(onDismiss).toHaveBeenCalledWith(suggestions[1]);
    await expectNoA11yViolations(container);
  });

  it('disables the actions of the row being actioned', async () => {
    const { container } = render(
      <SocialLinkSuggestionRows
        suggestions={suggestions}
        actioningId='s1'
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    const adds = screen.getAllByRole('button', { name: 'Add' });
    expect(adds[0]).toBeDisabled();
    expect(adds[1]).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Dismiss Instagram' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });
});

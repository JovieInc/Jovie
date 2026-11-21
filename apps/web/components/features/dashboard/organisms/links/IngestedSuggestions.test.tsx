import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/analytics';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { IngestedSuggestions, type SuggestedLink } from './IngestedSuggestions';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

function suggestion(id: string, name: string): SuggestedLink {
  return {
    suggestionId: id,
    platform: {
      id,
      name,
      category: 'social',
      icon: id,
      color: '#888888',
      placeholder: '',
    },
    normalizedUrl: `https://${id}.com/novalane`,
    originalUrl: `https://${id}.com/novalane`,
    suggestedTitle: name,
    isValid: true,
  };
}

describe('IngestedSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing without suggestions', () => {
    const { container } = render(
      <IngestedSuggestions
        suggestions={[]}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('accepts and dismisses a suggestion with analytics', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    const items = [suggestion('instagram', 'Instagram')];
    const { container } = render(
      <IngestedSuggestions
        suggestions={items}
        onAccept={onAccept}
        onDismiss={onDismiss}
      />
    );

    const accept = screen.getByRole('button', {
      name: 'Accept Instagram suggestion',
    });
    expect(accept).toHaveAttribute('type', 'button');
    await user.click(accept);
    expect(onAccept).toHaveBeenCalledWith(items[0]);
    expect(track).toHaveBeenCalledWith(
      'dashboard_link_suggestion_accept',
      expect.objectContaining({ platform: 'instagram' })
    );

    await user.click(
      screen.getByRole('button', { name: 'Dismiss Instagram suggestion' })
    );
    expect(onDismiss).toHaveBeenCalledWith(items[0]);
    expect(onAccept).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders several suggestions axe-clean', async () => {
    const { container } = render(
      <IngestedSuggestions
        suggestions={[
          suggestion('instagram', 'Instagram'),
          suggestion('tiktok', 'TikTok'),
        ]}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getAllByTestId('ingested-suggestion-pill')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});

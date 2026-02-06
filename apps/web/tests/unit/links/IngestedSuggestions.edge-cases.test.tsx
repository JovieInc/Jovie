/**
 * Unit tests for IngestedSuggestions component - edge cases
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import {
  IngestedSuggestions,
  type SuggestedLink,
} from '@/components/dashboard/organisms/links/IngestedSuggestions';
import { track } from '@/lib/analytics';
import {
  createMockCallbacks,
  createMockSuggestion,
} from './IngestedSuggestions.test-utils';

describe('IngestedSuggestions - suggestionKey', () => {
  const { mockOnAccept, mockOnDismiss } = createMockCallbacks();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use default suggestionKey when not provided', () => {
    const suggestions = [
      createMockSuggestion('instagram', { suggestionId: 'custom-id' }),
    ];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    // Should render without error
    expect(screen.getByTestId('ingested-suggestion-pill')).toBeInTheDocument();
  });

  it('should use custom suggestionKey when provided', () => {
    const customKey = vi.fn((s: SuggestedLink) => `custom-${s.platform.id}`);
    const suggestions = [createMockSuggestion('instagram')];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
        suggestionKey={customKey}
      />
    );

    // Custom key function should have been called
    expect(customKey).toHaveBeenCalledWith(suggestions[0]);
  });
});

describe('IngestedSuggestions - edge cases', () => {
  const { mockOnAccept, mockOnDismiss } = createMockCallbacks();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle suggestion without suggestionId', () => {
    const suggestion: SuggestedLink = {
      platform: {
        id: 'instagram',
        name: 'Instagram',
        category: 'social',
        icon: 'instagram',
        color: '#E4405F',
        placeholder: '',
      },
      normalizedUrl: 'https://instagram.com/test',
      originalUrl: 'https://instagram.com/test',
      suggestedTitle: 'Instagram',
      isValid: true,
      // No suggestionId - should use platform::url combo
    };

    render(
      <IngestedSuggestions
        suggestions={[suggestion]}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    expect(screen.getByTestId('ingested-suggestion-pill')).toBeInTheDocument();
  });

  it('should handle suggestion with null confidence', () => {
    const suggestion = createMockSuggestion('instagram', {
      confidence: undefined,
    });
    suggestion.confidence = null;

    render(
      <IngestedSuggestions
        suggestions={[suggestion]}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    fireEvent.click(screen.getByTestId('ingested-suggestion-pill'));

    expect(track).toHaveBeenCalledWith(
      'link_suggestion_accepted',
      expect.objectContaining({
        confidence: null,
      })
    );
  });

  it('should handle suggestion with null sourcePlatform and sourceType', () => {
    const suggestion: SuggestedLink = {
      platform: {
        id: 'instagram',
        name: 'Instagram',
        category: 'social',
        icon: 'instagram',
        color: '#E4405F',
        placeholder: '',
      },
      normalizedUrl: 'https://instagram.com/test',
      originalUrl: 'https://instagram.com/test',
      suggestedTitle: 'Instagram',
      isValid: true,
      sourcePlatform: null,
      sourceType: null,
    };

    render(
      <IngestedSuggestions
        suggestions={[suggestion]}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    fireEvent.click(screen.getByTestId('ingested-suggestion-pill'));

    expect(track).toHaveBeenCalledWith(
      'link_suggestion_accepted',
      expect.objectContaining({
        sourcePlatform: null,
        sourceType: null,
      })
    );
  });

  it('should handle URL without @ identity by using compact URL display', () => {
    const suggestion: SuggestedLink = {
      platform: {
        id: 'website',
        name: 'Website',
        category: 'custom',
        icon: 'website',
        color: '#000000',
        placeholder: '',
      },
      normalizedUrl: 'https://example.com/my-page',
      originalUrl: 'https://example.com/my-page',
      suggestedTitle: 'Website',
      isValid: true,
    };

    render(
      <IngestedSuggestions
        suggestions={[suggestion]}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    const pill = screen.getByTestId('ingested-suggestion-pill');
    // For website, should show the hostname
    expect(pill).toHaveTextContent('Website');
    expect(pill).toHaveTextContent('example.com');
  });

  it('should handle profileId being undefined', () => {
    const suggestions = [createMockSuggestion('instagram')];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
        // No profileId
      />
    );

    fireEvent.click(screen.getByTestId('ingested-suggestion-pill'));

    expect(track).toHaveBeenCalledWith(
      'link_suggestion_accepted',
      expect.objectContaining({
        profileId: null,
      })
    );
  });
});

describe('IngestedSuggestions - multiple suggestions', () => {
  const { mockOnAccept, mockOnDismiss } = createMockCallbacks();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should allow accepting different suggestions independently', () => {
    const suggestions = [
      createMockSuggestion('instagram', { suggestionId: 'sug-1' }),
      createMockSuggestion('tiktok', { suggestionId: 'sug-2' }),
    ];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    const pills = screen.getAllByTestId('ingested-suggestion-pill');

    // Click first pill (Instagram)
    fireEvent.click(pills[0]);
    expect(mockOnAccept).toHaveBeenLastCalledWith(suggestions[0]);

    // Click second pill (TikTok)
    fireEvent.click(pills[1]);
    expect(mockOnAccept).toHaveBeenLastCalledWith(suggestions[1]);

    expect(mockOnAccept).toHaveBeenCalledTimes(2);
  });

  it('should allow dismissing different suggestions independently', () => {
    const suggestions = [
      createMockSuggestion('instagram', { suggestionId: 'sug-1' }),
      createMockSuggestion('tiktok', { suggestionId: 'sug-2' }),
    ];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    // Dismiss Instagram
    fireEvent.click(screen.getByLabelText('Dismiss Instagram suggestion'));
    expect(mockOnDismiss).toHaveBeenLastCalledWith(suggestions[0]);

    // Dismiss TikTok
    fireEvent.click(screen.getByLabelText('Dismiss Tiktok suggestion'));
    expect(mockOnDismiss).toHaveBeenLastCalledWith(suggestions[1]);

    expect(mockOnDismiss).toHaveBeenCalledTimes(2);
  });
});

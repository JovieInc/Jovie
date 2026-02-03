/**
 * Unit tests for IngestedSuggestions component - surfaced tracking analytics
 */

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IngestedSuggestions } from '@/components/dashboard/organisms/links/IngestedSuggestions';
import { track } from '@/lib/analytics';
import {
  createMockCallbacks,
  createMockSuggestion,
} from './IngestedSuggestions.test-utils';

describe('IngestedSuggestions - surfaced tracking', () => {
  const { mockOnAccept, mockOnDismiss } = createMockCallbacks();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fire link_suggestion_surfaced for each suggestion on mount', () => {
    const suggestions = [
      createMockSuggestion('instagram', { suggestionId: 'sug-1' }),
      createMockSuggestion('tiktok', { suggestionId: 'sug-2' }),
    ];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
        profileId='test-profile'
      />
    );

    // Should fire surfaced event for each suggestion
    expect(track).toHaveBeenCalledWith(
      'link_suggestion_surfaced',
      expect.objectContaining({
        platformId: 'instagram',
        profileId: 'test-profile',
      })
    );

    expect(track).toHaveBeenCalledWith(
      'link_suggestion_surfaced',
      expect.objectContaining({
        platformId: 'tiktok',
        profileId: 'test-profile',
      })
    );
  });

  it('should not fire duplicate surfaced events for the same suggestion', () => {
    const suggestions = [
      createMockSuggestion('instagram', { suggestionId: 'same-id' }),
    ];

    const { rerender } = render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    const surfacedCallsBefore = (
      track as ReturnType<typeof vi.fn>
    ).mock.calls.filter(call => call[0] === 'link_suggestion_surfaced').length;

    // Rerender with same suggestions
    rerender(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    const surfacedCallsAfter = (
      track as ReturnType<typeof vi.fn>
    ).mock.calls.filter(call => call[0] === 'link_suggestion_surfaced').length;

    // Should not have fired additional surfaced events
    expect(surfacedCallsAfter).toBe(surfacedCallsBefore);
  });
});

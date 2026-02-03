/**
 * Unit tests for IngestedSuggestions component - dismiss flow
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IngestedSuggestions } from '@/components/dashboard/organisms/links/IngestedSuggestions';
import { track } from '@/lib/analytics';
import {
  createMockCallbacks,
  createMockSuggestion,
} from './IngestedSuggestions.test-utils';

describe('IngestedSuggestions - dismiss flow', () => {
  const { mockOnAccept, mockOnDismiss } = createMockCallbacks();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call onDismiss when dismiss button is clicked', () => {
    const suggestions = [createMockSuggestion('instagram')];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    const dismissBtn = screen.getByLabelText('Dismiss Instagram suggestion');
    fireEvent.click(dismissBtn);

    expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    expect(mockOnDismiss).toHaveBeenCalledWith(suggestions[0]);
  });

  it('should NOT call onAccept when dismiss button is clicked', () => {
    const suggestions = [createMockSuggestion('instagram')];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    const dismissBtn = screen.getByLabelText('Dismiss Instagram suggestion');
    fireEvent.click(dismissBtn);

    expect(mockOnAccept).not.toHaveBeenCalled();
  });

  it('should fire analytics events on dismiss (sync handler)', () => {
    const suggestions = [
      createMockSuggestion('tiktok', {
        confidence: 0.75,
        sourcePlatform: 'instagram',
        sourceType: 'linktree',
      }),
    ];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
        profileId='test-profile'
      />
    );

    fireEvent.click(screen.getByLabelText('Dismiss Tiktok suggestion'));

    // Should fire dashboard_link_suggestion_dismiss
    expect(track).toHaveBeenCalledWith(
      'dashboard_link_suggestion_dismiss',
      expect.objectContaining({
        platform: 'tiktok',
        sourcePlatform: 'instagram',
        sourceType: 'linktree',
        confidence: 0.75,
      })
    );

    // Should fire link_suggestion_dismissed
    expect(track).toHaveBeenCalledWith(
      'link_suggestion_dismissed',
      expect.objectContaining({
        platformId: 'tiktok',
        profileId: 'test-profile',
      })
    );
  });

  it('should fire analytics events after async handler resolves', async () => {
    const asyncOnDismiss = vi.fn().mockResolvedValue(undefined);
    const suggestions = [createMockSuggestion('instagram')];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={asyncOnDismiss}
        profileId='test-profile'
      />
    );

    fireEvent.click(screen.getByLabelText('Dismiss Instagram suggestion'));

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith(
        'link_suggestion_dismissed',
        expect.objectContaining({
          platformId: 'instagram',
        })
      );
    });
  });
});

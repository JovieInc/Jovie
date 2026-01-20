/**
 * Unit tests for IngestedSuggestions component - accept flow
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './IngestedSuggestions.test-utils';

import { IngestedSuggestions } from '@/components/dashboard/organisms/links/IngestedSuggestions';
import { track } from '@/lib/analytics';
import {
  createMockCallbacks,
  createMockSuggestion,
} from './IngestedSuggestions.test-utils';

describe('IngestedSuggestions - accept flow', () => {
  const { mockOnAccept, mockOnDismiss } = createMockCallbacks();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call onAccept when pill is clicked', () => {
    const suggestions = [createMockSuggestion('instagram')];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={mockOnAccept}
        onDismiss={mockOnDismiss}
      />
    );

    const pill = screen.getByTestId('ingested-suggestion-pill');
    fireEvent.click(pill);

    expect(mockOnAccept).toHaveBeenCalledTimes(1);
    expect(mockOnAccept).toHaveBeenCalledWith(suggestions[0]);
  });

  it('should fire analytics events on accept (sync handler)', () => {
    const suggestions = [
      createMockSuggestion('instagram', {
        confidence: 0.9,
        sourcePlatform: 'tiktok',
        sourceType: 'bio',
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

    fireEvent.click(screen.getByTestId('ingested-suggestion-pill'));

    // Should fire dashboard_link_suggestion_accept
    expect(track).toHaveBeenCalledWith(
      'dashboard_link_suggestion_accept',
      expect.objectContaining({
        platform: 'instagram',
        sourcePlatform: 'tiktok',
        sourceType: 'bio',
        confidence: 0.9,
      })
    );

    // Should fire link_suggestion_accepted
    expect(track).toHaveBeenCalledWith(
      'link_suggestion_accepted',
      expect.objectContaining({
        platformId: 'instagram',
        profileId: 'test-profile',
      })
    );
  });

  it('should fire analytics events after async handler resolves', async () => {
    const asyncOnAccept = vi.fn().mockResolvedValue(undefined);
    const suggestions = [createMockSuggestion('instagram')];

    render(
      <IngestedSuggestions
        suggestions={suggestions}
        onAccept={asyncOnAccept}
        onDismiss={mockOnDismiss}
        profileId='test-profile'
      />
    );

    fireEvent.click(screen.getByTestId('ingested-suggestion-pill'));

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith(
        'link_suggestion_accepted',
        expect.objectContaining({
          platformId: 'instagram',
        })
      );
    });
  });
});

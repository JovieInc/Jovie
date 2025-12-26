/**
 * Unit tests for IngestedSuggestions component
 *
 * Tests cover: rendering suggestions, accept/dismiss callbacks,
 * analytics events, and edge cases.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

// Mock SocialIcon to avoid heavy simple-icons import
vi.mock('@/components/atoms/SocialIcon', () => {
  const MockSocialIcon = ({ className }: { className?: string }) => (
    <div data-testid='social-icon' className={className} />
  );
  return {
    __esModule: true,
    SocialIcon: MockSocialIcon,
    getPlatformIcon: () => ({ hex: '000000' }),
  } as unknown as typeof import('@/components/atoms/SocialIcon');
});

import type { SuggestedLink } from '@/components/dashboard/organisms/links/hooks/useSuggestions';
// Import after mocks
import { IngestedSuggestions } from '@/components/dashboard/organisms/links/IngestedSuggestions';
import { track } from '@/lib/analytics';

/**
 * Helper to create a mock SuggestedLink
 */
function createMockSuggestion(
  platformId: string,
  options: {
    suggestionId?: string;
    confidence?: number;
    sourcePlatform?: string;
    sourceType?: string;
    normalizedUrl?: string;
  } = {}
): SuggestedLink {
  const {
    suggestionId = `suggestion-${platformId}-${Math.random().toString(36).slice(2)}`,
    confidence = 0.85,
    sourcePlatform = 'instagram',
    sourceType = 'bio',
    normalizedUrl = `https://${platformId}.com/testuser`,
  } = options;

  return {
    platform: {
      id: platformId,
      name: platformId.charAt(0).toUpperCase() + platformId.slice(1),
      category: 'social' as const,
      icon: platformId,
      color: '#000000',
      placeholder: '',
    },
    normalizedUrl,
    originalUrl: normalizedUrl,
    suggestedTitle: `${platformId} suggested link`,
    isValid: true,
    suggestionId,
    state: 'suggested' as const,
    confidence,
    sourcePlatform,
    sourceType,
  };
}

describe('IngestedSuggestions', () => {
  const mockOnAccept = vi.fn();
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render suggestions container with aria-label', () => {
      const suggestions = [createMockSuggestion('instagram')];

      render(
        <IngestedSuggestions
          suggestions={suggestions}
          onAccept={mockOnAccept}
          onDismiss={mockOnDismiss}
        />
      );

      expect(
        screen.getByLabelText('Ingested link suggestions')
      ).toBeInTheDocument();
    });

    it('should render multiple suggestions', () => {
      const suggestions = [
        createMockSuggestion('instagram'),
        createMockSuggestion('tiktok'),
        createMockSuggestion('twitter'),
      ];

      render(
        <IngestedSuggestions
          suggestions={suggestions}
          onAccept={mockOnAccept}
          onDismiss={mockOnDismiss}
        />
      );

      expect(screen.getAllByTestId('ingested-suggestion-pill')).toHaveLength(3);
    });

    it('should not render when suggestions array is empty', () => {
      const { container } = render(
        <IngestedSuggestions
          suggestions={[]}
          onAccept={mockOnAccept}
          onDismiss={mockOnDismiss}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should apply custom className', () => {
      const suggestions = [createMockSuggestion('instagram')];

      render(
        <IngestedSuggestions
          suggestions={suggestions}
          onAccept={mockOnAccept}
          onDismiss={mockOnDismiss}
          className='custom-class'
        />
      );

      const container = screen.getByLabelText('Ingested link suggestions');
      expect(container).toHaveClass('custom-class');
    });

    it('should display platform name and identity in pill', () => {
      const suggestions = [
        createMockSuggestion('instagram', {
          normalizedUrl: 'https://instagram.com/testartist',
        }),
      ];

      render(
        <IngestedSuggestions
          suggestions={suggestions}
          onAccept={mockOnAccept}
          onDismiss={mockOnDismiss}
        />
      );

      const pill = screen.getByTestId('ingested-suggestion-pill');
      expect(pill).toHaveTextContent('Instagram');
      expect(pill).toHaveTextContent('@testartist');
    });

    it('should show Suggested badge', () => {
      const suggestions = [createMockSuggestion('instagram')];

      render(
        <IngestedSuggestions
          suggestions={suggestions}
          onAccept={mockOnAccept}
          onDismiss={mockOnDismiss}
        />
      );

      expect(screen.getByText('Suggested')).toBeInTheDocument();
    });

    it('should render dismiss button with correct aria-label', () => {
      const suggestions = [createMockSuggestion('instagram')];

      render(
        <IngestedSuggestions
          suggestions={suggestions}
          onAccept={mockOnAccept}
          onDismiss={mockOnDismiss}
        />
      );

      expect(
        screen.getByLabelText('Dismiss Instagram suggestion')
      ).toBeInTheDocument();
    });
  });

  describe('accept flow', () => {
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

  describe('dismiss flow', () => {
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

  describe('surfaced tracking', () => {
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
      ).mock.calls.filter(
        call => call[0] === 'link_suggestion_surfaced'
      ).length;

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
      ).mock.calls.filter(
        call => call[0] === 'link_suggestion_surfaced'
      ).length;

      // Should not have fired additional surfaced events
      expect(surfacedCallsAfter).toBe(surfacedCallsBefore);
    });
  });

  describe('suggestionKey', () => {
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
      expect(
        screen.getByTestId('ingested-suggestion-pill')
      ).toBeInTheDocument();
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

  describe('edge cases', () => {
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

      expect(
        screen.getByTestId('ingested-suggestion-pill')
      ).toBeInTheDocument();
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

  describe('multiple suggestions', () => {
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
});

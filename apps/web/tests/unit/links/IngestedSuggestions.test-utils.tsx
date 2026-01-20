/**
 * Shared test utilities for IngestedSuggestions tests
 */

import { vi } from 'vitest';
import type { SuggestedLink } from '@/components/dashboard/organisms/links/IngestedSuggestions';

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

/**
 * Helper to create a mock SuggestedLink
 */
export function createMockSuggestion(
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

/**
 * Creates mock callback functions for testing
 */
export function createMockCallbacks() {
  return {
    mockOnAccept: vi.fn(),
    mockOnDismiss: vi.fn(),
  };
}

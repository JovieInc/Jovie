/**
 * Shared test utilities for useSuggestions tests
 */
import { vi } from 'vitest';

import type { SuggestedLink } from '@/components/dashboard/organisms/links/hooks/useSuggestions';

// Mock the analytics module
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

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
    suggestionId = `suggestion-${platformId}-${Date.now()}`,
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

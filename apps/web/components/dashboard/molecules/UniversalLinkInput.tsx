'use client';

/**
 * UniversalLinkInput Component
 *
 * @deprecated This file is maintained for backwards compatibility.
 * Import from '@/components/dashboard/molecules/universal-link-input' for new code.
 */

export type { UniversalLinkInputRef } from './universal-link-input';
export { UniversalLinkInput } from './universal-link-input';

// Re-export utilities for backwards compatibility
export {
  fuzzyScore,
  isUnsafeUrl,
  looksLikeUrlOrDomain,
  normalizeQuery,
  rankPlatformOptions,
} from './universal-link-input/utils';

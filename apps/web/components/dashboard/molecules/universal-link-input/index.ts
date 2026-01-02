/**
 * UniversalLinkInput
 *
 * Modular link input component for adding social links.
 */

export type {
  UniversalLinkInputProps,
  UniversalLinkInputRef,
  UseUniversalLinkInputReturn,
} from './types';
export { UniversalLinkInput } from './UniversalLinkInput';
export { useUniversalLinkInput } from './useUniversalLinkInput';

export {
  fuzzyScore,
  isUnsafeUrl,
  looksLikeUrlOrDomain,
  normalizeQuery,
  rankPlatformOptions,
  UNSAFE_URL_PREFIXES,
} from './utils';

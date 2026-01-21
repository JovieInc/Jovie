/**
 * UniversalLinkInput
 *
 * Modular link input component for adding social links.
 */

export type { UniversalLinkInputRef } from './UniversalLinkInput';
export { UniversalLinkInput } from './UniversalLinkInput';

export {
  isUnsafeUrl,
  looksLikeUrlOrDomain,
  normalizeQuery,
  rankPlatformOptions,
  UNSAFE_URL_PREFIXES,
} from './utils';

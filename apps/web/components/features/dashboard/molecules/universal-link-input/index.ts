/**
 * UniversalLinkInput
 *
 * Modular link input component for adding social links and chatting with Jovie.
 */

export type { UniversalLinkInputRef } from './UniversalLinkInput';
export { UniversalLinkInput } from './UniversalLinkInput';

export type { InputMode } from './useChatMode';
export { useChatMode } from './useChatMode';

export {
  isUnsafeUrl,
  looksLikeUrlOrDomain,
  normalizeQuery,
  rankPlatformOptions,
  UNSAFE_URL_PREFIXES,
} from './utils';

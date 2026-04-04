import type { DetectedLink } from '@/lib/utils/platform-detection';
import { compactUrlDisplay } from '../links/utils';

export function buildPillLabel(link: DetectedLink): string {
  const platform = link.platform.name || link.platform.id;
  const identity = compactUrlDisplay(
    link.platform.id,
    link.normalizedUrl
  ).trim();
  const suggested = (link.suggestedTitle || '').trim();

  // Strip auto-generated title patterns:
  //   "@timwhite on YouTube" → "@timwhite"
  //   "TikTok (@username)"  → "@username"
  const cleanSuggested = (() => {
    if (!suggested) return '';
    // "Platform (@handle)" pattern (TikTok, etc.)
    const parenMatch = /\(@([^)]+)\)/.exec(suggested);
    if (parenMatch) return `@${parenMatch[1]}`;
    // "Handle on Platform" pattern
    const onIdx = suggested.toLowerCase().indexOf(' on ');
    if (onIdx !== -1) {
      return suggested.slice(0, onIdx).trim();
    }
    return suggested;
  })();

  // Fallback chain: displayText → handle → platform name
  // displayText is embedded in suggestedTitle by link-transformers.ts:57

  // 1. If suggestedTitle carries a user-set displayText (differs from platform name), use it.
  if (cleanSuggested && cleanSuggested !== platform) {
    return cleanSuggested.length <= 40
      ? cleanSuggested
      : cleanSuggested.slice(0, 37) + '...';
  }

  // 2. If @handle extractable from URL, use it.
  if (identity.startsWith('@')) {
    return identity;
  }

  // 3. Website-style labels: show the host.
  if (link.platform.id === 'website' && identity) {
    return identity.length <= 40 ? identity : platform;
  }

  // 4. Fall back to platform name.
  return platform;
}

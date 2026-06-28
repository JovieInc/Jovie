import type { ChatRailContextKind } from '@/app/app/(shell)/chat/ChatEntityPanelContext';

/** Wire-format / system-prompt placeholders that must never reach UI copy. */
const TEMPLATE_PLACEHOLDER_PATTERN = /^<[a-z][a-z0-9_]*>$/i;

const KIND_FALLBACK_LABELS: Record<ChatRailContextKind, string> = {
  profile: 'Profile',
  release: 'Release',
  artist: 'Artist',
  track: 'Track',
  event: 'Event',
  contact: 'Contact',
  'tour-date': 'Tour Date',
};

export function isChatContextTemplatePlaceholder(
  value: string | null | undefined
): boolean {
  const trimmed = value?.trim();
  if (!trimmed) {
    return false;
  }
  return TEMPLATE_PLACEHOLDER_PATTERN.test(trimmed);
}

/**
 * Resolve a chat right-rail context label for display.
 * Empty values and raw template tokens (`<title>`, `<name>`, …) fall back to a
 * kind-based label so entity cards never render wire-syntax placeholders.
 */
export function resolveChatRailContextLabel(
  kind: ChatRailContextKind,
  label: string | null | undefined
): string {
  const trimmed = label?.trim();
  if (!trimmed || isChatContextTemplatePlaceholder(trimmed)) {
    return KIND_FALLBACK_LABELS[kind];
  }
  return trimmed;
}

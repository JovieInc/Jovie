import { skillById } from '@/lib/commands/registry';
import { parseTokens } from './tokens';

const DEFAULT_MAX_TITLE_LENGTH = 80;
const titleSegments = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

interface ConversationTitleRecord {
  readonly title: string | null;
}

function humanizeIdentifier(value: string): string {
  const spaced = value
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : '';
}

function stripResidualTokenSyntax(value: string): string {
  return value
    .replaceAll(/\/skill:[A-Za-z]\w*/g, ' ')
    .replaceAll(/\bskill\b/gi, ' ')
    .replaceAll(
      /@(release|artist|track|event):[^\s[\]]+\[((?:\\.|[^\]\\])*)\]/g,
      '$2'
    )
    .replaceAll(/[\\/[\]{}]+/g, ' ');
}

function truncateTitle(value: string, maxLength: number): string {
  const segments = Array.from(
    titleSegments.segment(value),
    part => part.segment
  );
  if (segments.length <= maxLength) return value;
  const ellipsis = '...'.slice(0, Math.max(0, maxLength));
  return `${segments
    .slice(0, Math.max(0, maxLength - ellipsis.length))
    .join('')
    .trimEnd()}${ellipsis}`;
}

export function sanitizeConversationTitle(
  value: string | null | undefined,
  maxLength = DEFAULT_MAX_TITLE_LENGTH
): string | null {
  const input = value?.trim();
  if (!input) return null;

  const rendered = parseTokens(input)
    .map(token => {
      if (token.type === 'text') return token.value;
      if (token.type === 'entity') return token.label;
      return skillById(token.id)?.label ?? humanizeIdentifier(token.id);
    })
    .join(' ');

  const normalized = stripResidualTokenSyntax(rendered)
    .replaceAll(/\s+/g, ' ')
    .trim();
  const unwrapped =
    normalized.length > 1 &&
    ['"', "'"].includes(normalized[0]) &&
    normalized.at(-1) === normalized[0]
      ? normalized.slice(1, -1)
      : normalized;

  if (!unwrapped) return null;
  return truncateTitle(unwrapped, maxLength);
}

export function withSanitizedConversationTitle<
  TConversation extends ConversationTitleRecord,
>(
  conversation: TConversation
): Omit<TConversation, 'title'> & { readonly title: string | null } {
  return {
    ...conversation,
    title: sanitizeConversationTitle(conversation.title),
  };
}

export function withSanitizedConversationTitles<
  TConversation extends ConversationTitleRecord,
>(
  conversations: readonly TConversation[]
): Array<Omit<TConversation, 'title'> & { readonly title: string | null }> {
  return conversations.map(withSanitizedConversationTitle);
}

import { skillById } from '@/lib/commands/registry';
import { parseTokens } from './tokens';

const DEFAULT_MAX_TITLE_LENGTH = 80;

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
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
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
    .trim()
    .replaceAll(/(?:^["'])|(?:["']$)/g, '');

  if (!normalized) return null;
  return truncateTitle(normalized, maxLength);
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

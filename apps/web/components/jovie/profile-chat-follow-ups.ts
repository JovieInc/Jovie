import { parseTokens } from '@/lib/chat/tokens';
import type { MessagePart } from './types';
import { getMessageText } from './utils';

export interface ChatFollowUp {
  readonly label: string;
  readonly prompt: string;
}

/** Next moves offered under the first reply of a chat started from a profile. */
export const PROFILE_CHAT_FOLLOW_UPS: readonly ChatFollowUp[] = [
  { label: 'Plan My Next Release', prompt: 'Plan my next release.' },
  { label: 'Tighten My Bio', prompt: 'Tighten my bio.' },
  { label: 'Grow My Audience', prompt: 'How do I grow my audience?' },
  { label: 'Read My Numbers', prompt: 'What are my numbers telling me?' },
];

interface FollowUpMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly status?: string;
  readonly parts: readonly MessagePart[];
}

/** True when a user turn is only the creator's own `@profile` chip. */
export function isOwnProfileChipTurn(
  text: string,
  profileId: string | null | undefined
): boolean {
  if (!profileId) return false;
  const tokens = parseTokens(text);
  return (
    tokens.some(
      token =>
        token.type === 'entity' &&
        token.kind === 'profile' &&
        token.id === profileId
    ) &&
    tokens.every(
      token =>
        token.type === 'entity' ||
        (token.type === 'text' && !token.value.trim())
    )
  );
}

/**
 * Which assistant message the profile follow-ups sit under, if any: only the
 * finished first reply in a chat that opened with the profile chip alone, and
 * only until the person sends anything else.
 */
export function profileFollowUpAnchorId(
  messages: readonly FollowUpMessage[],
  profileId: string | null | undefined,
  isStreaming: boolean
): string | null {
  if (isStreaming || messages.length !== 2) return null;
  const [first, reply] = messages;
  if (first.role !== 'user' || reply.role !== 'assistant') return null;
  if (reply.status === 'pending' || !getMessageText(reply.parts).trim()) {
    return null;
  }
  return isOwnProfileChipTurn(getMessageText(first.parts), profileId)
    ? reply.id
    : null;
}

import type { ChatRailContextTarget } from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import { isChatContextTemplatePlaceholder } from '@/lib/chat/context-label';
import { parseTokens } from '@/lib/chat/tokens';
import { encodeToolEvents } from '@/lib/chat/tool-events';
import type { MessagePart } from './types';
import { getMessageText } from './utils';

interface ChatRailMessage {
  readonly id: string;
  readonly parts: readonly MessagePart[];
}

interface ChatRailProfileContext {
  readonly id: string;
  readonly label?: string | null;
}

interface DeriveChatRailContextTargetsInput {
  readonly messages: readonly ChatRailMessage[];
  readonly profile?: ChatRailProfileContext | null;
}

const PROFILE_CONTEXT_TOOL_NAMES = new Set([
  'proposeAvatarUpload',
  'proposeProfileEdit',
  'proposeSocialLink',
  'proposeSocialLinkRemoval',
  'searchSpotifyArtist',
  'confirmSpotifyArtist',
  'checkHandle',
  'writeWorldClassBio',
]);

const TOOL_ENTITY_FIELDS = [
  {
    kind: 'release',
    idKeys: ['releaseId', 'release_id', 'selectedReleaseId'],
    labelKeys: ['releaseTitle', 'release_title', 'title'],
  },
  {
    kind: 'artist',
    idKeys: ['artistId', 'artist_id', 'spotifyArtistId'],
    labelKeys: ['artistName', 'artist_name', 'displayName', 'name'],
  },
  {
    kind: 'track',
    idKeys: ['trackId', 'track_id'],
    labelKeys: ['trackTitle', 'track_title', 'title'],
  },
  {
    kind: 'event',
    idKeys: ['eventId', 'event_id', 'tourDateId', 'tour_date_id'],
    labelKeys: ['eventTitle', 'event_title', 'venue', 'title'],
  },
  {
    kind: 'contact',
    idKeys: ['contactId', 'contact_id'],
    labelKeys: ['contactName', 'contact_name', 'personName', 'companyName'],
  },
] as const;

function firstStringValue(
  record: Record<string, unknown> | undefined,
  keys: readonly string[]
): string | null {
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

export function deriveChatRailContextTargets({
  messages,
  profile,
}: DeriveChatRailContextTargetsInput): readonly ChatRailContextTarget[] {
  const targets: ChatRailContextTarget[] = [];

  for (const message of messages) {
    const text = getMessageText(message.parts);
    const tokens = parseTokens(text);

    tokens.forEach((token, tokenIndex) => {
      if (token.type !== 'entity') {
        return;
      }

      // The system prompt documents token syntax with literal placeholders
      // (`@release:<id>[<title>]`); when the model echoes one back, the parsed
      // id is the placeholder itself, not a real entity id (JOV-3308).
      if (isChatContextTemplatePlaceholder(token.id)) {
        return;
      }

      targets.push({
        kind: token.kind,
        id: token.id,
        label: token.label,
        source: 'message',
        focusKey: `message:${message.id}:entity:${token.kind}:${token.id}:${tokenIndex}`,
      });
    });

    const toolEvents = encodeToolEvents(message.parts) ?? [];
    for (const event of toolEvents) {
      if (profile && PROFILE_CONTEXT_TOOL_NAMES.has(event.toolName)) {
        targets.push({
          kind: 'profile',
          id: profile.id,
          label: profile.label,
          source: 'tool',
          focusKey: `tool:${event.toolCallId}:profile:${profile.id}`,
          toolCallId: event.toolCallId,
        });
      }

      for (const field of TOOL_ENTITY_FIELDS) {
        const id =
          firstStringValue(event.input, field.idKeys) ??
          firstStringValue(event.output, field.idKeys);

        if (!id || isChatContextTemplatePlaceholder(id)) {
          continue;
        }

        const label =
          firstStringValue(event.input, field.labelKeys) ??
          firstStringValue(event.output, field.labelKeys);

        targets.push({
          kind: field.kind,
          id,
          label,
          source: 'tool',
          focusKey: `tool:${event.toolCallId}:entity:${field.kind}:${id}`,
          toolCallId: event.toolCallId,
        });
      }
    }
  }

  return targets;
}

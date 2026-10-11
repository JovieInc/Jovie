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

export interface ProjectChatRailContextTargetsInput
  extends DeriveChatRailContextTargetsInput {
  readonly conversationKey: string | null;
  readonly messages: readonly (ChatRailMessage & {
    readonly streamRevision: number;
  })[];
}

interface CachedMessageContext {
  readonly parts: readonly MessagePart[];
  readonly streamRevision: number;
  readonly targets: readonly ChatRailContextTarget[];
}

function contextTargetsEqual(
  left: readonly ChatRailContextTarget[],
  right: readonly ChatRailContextTarget[]
): boolean {
  return (
    left.length === right.length &&
    left.every((target, index) => {
      const other = right[index];
      return (
        target.kind === other.kind &&
        target.id === other.id &&
        target.label === other.label &&
        target.source === other.source &&
        target.focusKey === other.focusKey &&
        target.toolCallId === other.toolCallId
      );
    })
  );
}

/**
 * Cache expensive text/token/tool parsing for the current conversation only.
 * The timeline replaces parts on history/tool updates and advances streamRevision
 * for streamed text and tool deltas; both belong to the cache key. Checking those
 * revisions remains O(messages), without rescanning completed message contents.
 */
export function createChatRailContextProjector() {
  let conversationKey: string | null | undefined;
  let profileId: string | undefined;
  let profileLabel: string | null | undefined;
  let entries = new Map<string, CachedMessageContext>();
  let orderedTargets: readonly (readonly ChatRailContextTarget[])[] = [];
  let targets: readonly ChatRailContextTarget[] = [];

  return (input: ProjectChatRailContextTargetsInput) => {
    if (
      conversationKey !== input.conversationKey ||
      profileId !== input.profile?.id ||
      profileLabel !== input.profile?.label
    ) {
      conversationKey = input.conversationKey;
      profileId = input.profile?.id;
      profileLabel = input.profile?.label;
      entries = new Map();
      orderedTargets = [];
      targets = [];
    }

    // Retain only messages present in this snapshot, including after pruning,
    // retry, or conversation replacement. No cross-conversation cache accumulates.
    const nextEntries = new Map<string, CachedMessageContext>();
    const nextOrderedTargets: (readonly ChatRailContextTarget[])[] = [];
    let changed = orderedTargets.length !== input.messages.length;

    for (const [index, message] of input.messages.entries()) {
      let entry = entries.get(message.id);
      if (
        !entry ||
        entry.parts !== message.parts ||
        entry.streamRevision !== message.streamRevision
      ) {
        const derived = deriveChatRailContextTargets({
          messages: [message],
          profile: input.profile,
        });
        entry = {
          parts: message.parts,
          streamRevision: message.streamRevision,
          targets:
            entry && contextTargetsEqual(entry.targets, derived)
              ? entry.targets
              : derived,
        };
      }
      nextEntries.set(message.id, entry);
      nextOrderedTargets.push(entry.targets);
      changed ||= orderedTargets[index] !== entry.targets;
    }

    entries = nextEntries;
    orderedTargets = nextOrderedTargets;
    if (changed) {
      const nextTargets = nextOrderedTargets.flat();
      if (!contextTargetsEqual(targets, nextTargets)) {
        targets = nextTargets;
      }
    }
    return targets;
  };
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

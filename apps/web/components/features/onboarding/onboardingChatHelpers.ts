// Pure message/tool-output parsing helpers extracted from OnboardingChat.
// Type guards + transforms, no JSX/hooks -- a testable logic module.

import { type UIMessage } from 'ai';
import type { MessagePart } from '@/components/jovie/types';
import { type CheckoutCardPayload } from './ChatProposeCheckoutCard';
import { type NextStepCardPayload } from './ChatProposeNextStepCard';
import type {
  OnboardingProfileArtist,
  OnboardingProfileBuilderState,
} from './OnboardingProfileRail';
import {
  type ArtistConfirmedOutput,
  type ArtistPickerOutput,
  type HandleCheckOutput,
  type OnboardingArtistSelection,
  type SocialLinkOutput,
} from './OnboardingToolArtifacts';

export const THINKING_PLACEHOLDER_ID = 'thinking-placeholder';

export function getMessageText(message: UIMessage): string {
  return (message.parts ?? [])
    .filter(
      (p): p is { type: 'text'; text: string } =>
        p.type === 'text' && typeof p.text === 'string'
    )
    .map(p => p.text)
    .join('');
}

export type ToolPart = MessagePart & {
  readonly type: string;
  readonly toolName?: string;
  readonly toolCallId?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly state?: string;
};

export function isToolPart(part: unknown): part is ToolPart {
  if (!part || typeof part !== 'object') return false;
  const type = (part as { type?: unknown }).type;
  return (
    type === 'dynamic-tool' ||
    (typeof type === 'string' && type.startsWith('tool-'))
  );
}

export function getToolName(part: ToolPart): string {
  if (part.toolName) return part.toolName;
  // Convention: AI SDK emits parts of type `tool-<name>` when output is present.
  return part.type.startsWith('tool-')
    ? part.type.slice('tool-'.length)
    : part.type;
}

/**
 * Extract tool parts from a message. Returns the structured parts (not text)
 * so the renderer can decide between rich cards (proposeNextStep,
 * proposeCheckout) and the chip fallback for the rest.
 */
export function getToolParts(message: UIMessage): readonly ToolPart[] {
  return ((message.parts ?? []) as readonly MessagePart[]).filter(isToolPart);
}

export interface ToolOutputWithAction {
  readonly action?: string;
}

export function isNextStepPayload(
  output: unknown
): output is NextStepCardPayload {
  return (
    typeof output === 'object' &&
    output !== null &&
    (output as ToolOutputWithAction).action === 'propose_next_step'
  );
}

export function isCheckoutPayload(
  output: unknown
): output is CheckoutCardPayload {
  return (
    typeof output === 'object' &&
    output !== null &&
    (output as ToolOutputWithAction).action === 'propose_checkout'
  );
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isArtistPickerOutput(
  output: unknown
): output is ArtistPickerOutput {
  return asRecord(output)?.action === 'open_artist_picker';
}

export function isArtistConfirmedOutput(
  output: unknown
): output is ArtistConfirmedOutput {
  return asRecord(output)?.action === 'spotify_artist_confirmed';
}

export function isHandleCheckOutput(
  output: unknown
): output is HandleCheckOutput {
  return asRecord(output)?.action === 'check_handle';
}

export function isSocialLinkOutput(
  output: unknown
): output is SocialLinkOutput {
  return asRecord(output)?.action === 'propose_social_link';
}

export function getInputQuery(part: ToolPart): string | null {
  const input = asRecord(part.input);
  return typeof input?.query === 'string' ? input.query : null;
}

export function findLastAssistantMessageId(messages: readonly UIMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (
      message.role === 'assistant' &&
      message.id !== THINKING_PLACEHOLDER_ID
    ) {
      return message.id;
    }
  }
  return null;
}

export function getOnboardingErrorMessage(message: string): string {
  if (/authentication service is initializing/i.test(message)) {
    return 'Jovie is still connecting. Try again in a moment.';
  }
  return message;
}

export function artistFromSelection(
  artist: OnboardingArtistSelection | null
): OnboardingProfileArtist | null {
  if (!artist) return null;
  return {
    id: artist.id,
    name: artist.name,
    url: artist.url,
    imageUrl: artist.imageUrl ?? null,
    followers: artist.followers ?? null,
    popularity: artist.popularity ?? null,
    genres: [],
    dspMatches: [
      {
        id: 'spotify',
        label: 'Spotify',
        platform: 'spotify',
        url: artist.url,
      },
    ],
  };
}

export function artistFromConfirmedOutput(
  output: ArtistConfirmedOutput
): OnboardingProfileArtist | null {
  const artist = output.artist;
  if (!artist) return null;
  return {
    id: artist.id,
    name: artist.name,
    url: artist.url,
    imageUrl: artist.imageUrl ?? null,
    followers: artist.followers ?? null,
    popularity: artist.popularity ?? null,
    genres: artist.genres ?? [],
    dspMatches: [
      {
        id: 'spotify',
        label: 'Spotify',
        platform: 'spotify',
        url: artist.url,
      },
      ...(artist.dspMatches ?? []),
    ],
  };
}

export function cleanHandle(handle: string | undefined): string | null {
  const cleaned = handle?.replace(/^@/, '').trim().toLowerCase();
  return cleaned || null;
}

export function deriveProfileBuilderState({
  handleDraft,
  messages,
  selectedArtist,
}: {
  readonly handleDraft: string | null;
  readonly messages: readonly UIMessage[];
  readonly selectedArtist: OnboardingArtistSelection | null;
}): OnboardingProfileBuilderState {
  let artist = artistFromSelection(selectedArtist);
  let artistConfirmed = false;
  let handle: string | null = null;
  const socialLinks: string[] = [];

  for (const message of messages) {
    for (const part of getToolParts(message)) {
      const output = part.output;

      if (isArtistConfirmedOutput(output)) {
        const confirmedArtist = artistFromConfirmedOutput(output);
        artist = confirmedArtist ?? artist;
        artistConfirmed =
          Boolean(confirmedArtist) || Boolean(output.spotifyArtistId);
      }

      if (isHandleCheckOutput(output)) {
        handle = cleanHandle(output.handle) ?? handle;
      }

      if (isSocialLinkOutput(output) && output.url) {
        socialLinks.push(output.url);
      }
    }
  }

  return {
    artist,
    artistConfirmed,
    handle: handleDraft == null ? handle : cleanHandle(handleDraft),
    socialLinks,
  };
}

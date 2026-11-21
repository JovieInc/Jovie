import type { UIMessage } from 'ai';
import { createOnboardingTurnState } from '@/lib/chat/tools/onboarding-tool-impls';

export const ONBOARDING_SCRIPT_TEST_SESSION =
  '00112233-4455-6677-8899-aabbccddeeff';

export function userMessage(
  text: string,
  metadata?: Record<string, unknown>
): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    parts: [{ type: 'text', text }],
    ...(metadata ? { metadata } : {}),
  } as UIMessage;
}

export function assistantMessage(
  text: string,
  toolParts: readonly {
    toolName: string;
    output: Record<string, unknown>;
  }[] = []
): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    parts: [
      { type: 'text', text },
      ...toolParts.map(part => ({
        type: `tool-${part.toolName}`,
        toolCallId: crypto.randomUUID(),
        state: 'output-available',
        input: {},
        output: part.output,
      })),
    ],
  } as UIMessage;
}

export function turnStateFor(
  messages: readonly UIMessage[],
  accessControlled = false
) {
  return createOnboardingTurnState({
    sessionId: ONBOARDING_SCRIPT_TEST_SESSION,
    turnCount: messages.filter(m => m.role === 'user').length,
    accessControlled,
    messages,
  });
}

export const CONFIRMED_SPOTIFY_OUTPUT = {
  action: 'spotify_artist_confirmed',
  spotifyArtistId: 'artist-1',
  artist: {
    id: 'artist-1',
    name: 'Test Artist',
    url: 'https://open.spotify.com/artist/artist-1',
    followers: 12_300,
    popularity: 48,
    genres: ['house'],
  },
};

export const HANDLE_CHECKED_PART = {
  toolName: 'checkHandle',
  output: { action: 'check_handle', handle: 'testartist' },
} as const;

export const HANDLE_CONFIRMED_PART = {
  toolName: 'checkHandle',
  output: {
    action: 'handle_confirmed',
    handle: 'testartist',
    summary: 'Handle @testartist confirmed.',
  },
} as const;

export const SOCIAL_PROPOSED_PART = {
  toolName: 'proposeSocialLink',
  output: {
    action: 'propose_social_link',
    url: null,
    summary: 'Attach a public social account.',
  },
} as const;

export const SOCIAL_ATTACHED_PART = {
  toolName: 'proposeSocialLink',
  output: {
    action: 'social_attached',
    url: 'https://instagram.com/testartist',
    summary: 'Attached https://instagram.com/testartist.',
  },
} as const;

export function messagesThroughArtistConfirm() {
  return [
    userMessage('hey'),
    assistantMessage('Who are you?', [
      {
        toolName: 'confirmSpotifyArtist',
        output: CONFIRMED_SPOTIFY_OUTPUT,
      },
    ]),
  ];
}

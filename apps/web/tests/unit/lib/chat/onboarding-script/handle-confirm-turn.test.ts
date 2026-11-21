import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { decideFallbackTurn } from '@/lib/chat/onboarding-script/engine';
import {
  keepAuthTurnAfterHandleConfirmed,
  resolveAwaitingHandleConfirm,
} from '@/lib/chat/onboarding-script/handle-confirm-turn';
import { pickLine } from '@/lib/chat/onboarding-script/script';
import { createOnboardingTurnState } from '@/lib/chat/tools/onboarding-tool-impls';

const SESSION = '00112233-4455-6677-8899-aabbccddeeff';

function user(text: string): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    parts: [{ type: 'text', text }],
  } as UIMessage;
}

function assistant(
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

const HANDLE_CHECKED = {
  toolName: 'checkHandle',
  output: { action: 'check_handle', handle: 'testartist' },
} as const;

const CONFIRMED_OUTPUT = {
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

function baseThroughArtist(): UIMessage[] {
  return [
    user('hey'),
    assistant('Who are you?', [
      {
        toolName: 'confirmSpotifyArtist',
        output: CONFIRMED_OUTPUT,
      },
    ]),
  ];
}

function stateFor(messages: UIMessage[]) {
  return createOnboardingTurnState({
    sessionId: SESSION,
    turnCount: messages.filter(m => m.role === 'user').length,
    accessControlled: false,
    messages,
  });
}

describe('keepAuthTurnAfterHandleConfirmed', () => {
  it('opens auth handoff with handle_confirmed (no social card)', () => {
    const messages = baseThroughArtist();
    const turn = keepAuthTurnAfterHandleConfirmed(
      'testartist',
      stateFor(messages),
      stepId => pickLine(stepId, SESSION)
    );
    expect(turn.guardedStep).toBe('waitlist_or_complete');
    expect(turn.toolEvents.map(e => e.output.action)).toEqual([
      'handle_confirmed',
      'propose_next_step',
      'propose_checkout',
    ]);
    expect(turn.toolEvents.map(e => e.output.action)).not.toContain(
      'propose_social_link'
    );
    expect(turn.line.stepId).toBe('instant_access');
  });

  it('waitlists weak signal without asking social/audience', () => {
    const lowSignal = {
      ...CONFIRMED_OUTPUT,
      artist: { ...CONFIRMED_OUTPUT.artist, followers: 40 },
    };
    const messages = [
      user('hey'),
      assistant('Who are you?', [
        { toolName: 'confirmSpotifyArtist', output: lowSignal },
      ]),
    ];
    const turn = keepAuthTurnAfterHandleConfirmed(
      'testartist',
      stateFor(messages),
      stepId => pickLine(stepId, SESSION)
    );
    expect(turn.guardedStep).toBe('waitlist_or_complete');
    expect(turn.line.stepId).toBe('waitlist');
    expect(turn.toolEvents.map(e => e.output.action)).toEqual([
      'handle_confirmed',
      'propose_next_step',
    ]);
  });
});

describe('resolveAwaitingHandleConfirm', () => {
  const pick = (stepId: Parameters<typeof pickLine>[0]) =>
    pickLine(stepId, SESSION);

  it('locks shown handle on claim free-text and skips social', () => {
    const messages = [
      ...baseThroughArtist(),
      assistant('Claiming @testartist.', [HANDLE_CHECKED]),
      user('claim'),
    ];
    const turn = resolveAwaitingHandleConfirm({
      shownHandle: 'testartist',
      latest: user('claim'),
      latestIsWidgetEvent: false,
      typedHandle: null,
      state: stateFor(messages),
      pick,
    });
    expect(turn.guardedStep).toBe('waitlist_or_complete');
    expect(turn.toolEvents.map(e => e.output.action)).toContain(
      'handle_confirmed'
    );
    expect(turn.toolEvents.map(e => e.output.action)).toContain(
      'propose_next_step'
    );
    expect(turn.toolEvents.map(e => e.output.action)).not.toContain(
      'propose_social_link'
    );
  });

  it('locks shown handle on keep free-text', () => {
    const messages = [
      ...baseThroughArtist(),
      assistant('Claiming @testartist.', [HANDLE_CHECKED]),
      user('keep'),
    ];
    const turn = resolveAwaitingHandleConfirm({
      shownHandle: 'testartist',
      latest: user('keep this draft'),
      latestIsWidgetEvent: false,
      typedHandle: null,
      state: stateFor(messages),
      pick,
    });
    expect(turn.guardedStep).toBe('waitlist_or_complete');
    expect(turn.toolEvents.map(e => e.output.action)).toContain(
      'handle_confirmed'
    );
  });

  it('does not advance on ok', () => {
    const messages = [
      ...baseThroughArtist(),
      assistant('Claiming @testartist.', [HANDLE_CHECKED]),
      user('ok'),
    ];
    const turn = resolveAwaitingHandleConfirm({
      shownHandle: 'testartist',
      latest: user('ok'),
      latestIsWidgetEvent: false,
      typedHandle: null,
      state: stateFor(messages),
      pick,
    });
    expect(turn.guardedStep).toBe('handle');
    expect(turn.toolEvents.map(e => e.output.action)).not.toContain(
      'handle_confirmed'
    );
  });

  it('nudges toward Keep for non-handle free-text', () => {
    const messages = [
      ...baseThroughArtist(),
      assistant('Claiming @testartist.', [HANDLE_CHECKED]),
      user('what does a handle do here?'),
    ];
    const turn = resolveAwaitingHandleConfirm({
      shownHandle: 'testartist',
      latest: user('what does a handle do here?'),
      latestIsWidgetEvent: false,
      typedHandle: null,
      state: stateFor(messages),
      pick,
    });
    expect(turn.guardedStep).toBe('handle');
    expect(turn.text).toContain('Keep');
  });
});

describe('decideFallbackTurn free-text handle keep', () => {
  it('advances past handle to auth on claim / sign me up / keep', async () => {
    for (const text of ['claim', 'sign me up', 'confirm handle', 'keep']) {
      const messages = [
        ...baseThroughArtist(),
        assistant('Claiming @testartist.', [HANDLE_CHECKED]),
        user(text),
      ];
      const turn = await decideFallbackTurn({
        uiMessages: messages,
        state: createOnboardingTurnState({
          sessionId: SESSION,
          turnCount: messages.filter(m => m.role === 'user').length,
          accessControlled: false,
          messages,
        }),
      });
      expect(turn.guardedStep).toBe('waitlist_or_complete');
      expect(turn.toolEvents.map(e => e.output.action)).toContain(
        'handle_confirmed'
      );
      expect(turn.toolEvents.map(e => e.output.action)).toContain(
        'propose_next_step'
      );
      expect(turn.toolEvents.map(e => e.output.action)).not.toContain(
        'propose_social_link'
      );
      expect(turn.line.stepId).not.toBe('attach_social');
    }
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { decideFallbackTurn } from '@/lib/chat/onboarding-script/engine';
import {
  keepAuthTurnAfterHandleConfirmed,
  resolveAwaitingHandleConfirm,
} from '@/lib/chat/onboarding-script/handle-confirm-turn';
import { pickLine } from '@/lib/chat/onboarding-script/script';
import {
  assistantMessage as assistant,
  messagesThroughArtistConfirm as baseThroughArtist,
  CONFIRMED_SPOTIFY_OUTPUT as CONFIRMED_OUTPUT,
  HANDLE_CHECKED_PART as HANDLE_CHECKED,
  ONBOARDING_SCRIPT_TEST_SESSION as SESSION,
  turnStateFor as stateFor,
  userMessage as user,
} from './onboarding-script-test-fixtures';

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
        state: stateFor(messages),
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

  it('does not let adaptive draft outcome swallow short claim/keep', async () => {
    // Production served failure: draft.awaiting=outcome + claim (len≤5) never
    // sets draft.outcome, so adaptive-outcome replied instead of confirming.
    for (const text of ['claim', 'keep']) {
      const messages = [
        ...baseThroughArtist(),
        assistant('Claiming @testartist.', [HANDLE_CHECKED]),
        user(text),
      ];
      const state = stateFor(messages);
      state.profileDraft = {
        version: 1,
        roles: ['artist'],
        activeRole: 'artist',
        outcome: null,
        outcomes: {},
        sourceCandidates: [],
        selectedSource: {
          url: 'https://open.spotify.com/artist/artist-1',
          status: 'available',
          title: 'Test Artist',
          description: null,
          fetchedAt: new Date().toISOString(),
        },
        sourceSkipped: false,
        awaiting: 'outcome',
        lastUserMessageId: null,
      };
      const turn = await decideFallbackTurn({ uiMessages: messages, state });
      expect(turn.line.key).not.toMatch(/^greet:adaptive-/);
      expect(turn.guardedStep).toBe('waitlist_or_complete');
      expect(turn.toolEvents.map(e => e.output.action)).toContain(
        'handle_confirmed'
      );
    }
  });
});

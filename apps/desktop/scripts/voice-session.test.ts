import { expect, test } from 'vitest';
import {
  INITIAL_VOICE_SESSION_STATE,
  isVoiceSessionActive,
  MAX_VOICE_RECONNECT_ATTEMPTS,
  reduceVoiceSession,
  VOICE_DEGRADED_FALLBACK,
  type VoiceSessionEvent,
  type VoiceSessionState,
} from '../src/voice-session.ts';

function run(
  events: readonly VoiceSessionEvent[],
  from: VoiceSessionState = INITIAL_VOICE_SESSION_STATE
): VoiceSessionState {
  return events.reduce(reduceVoiceSession, from);
}

const activeSession = run([{ type: 'start' }, { type: 'mic-granted' }]);

test('start → mic granted reaches listening; denial degrades to text fallback', () => {
  expect(activeSession.phase).toBe('listening');
  const denied = run([{ type: 'start' }, { type: 'mic-denied' }]);
  expect(denied.phase).toBe('degraded');
  expect(denied.degradedReason).toBe('microphone-denied');
  expect(VOICE_DEGRADED_FALLBACK).toBe('text');
});

test('barge-in during speaking stops output and marks interrupted', () => {
  const speaking = run(
    [{ type: 'assistant-thinking' }, { type: 'assistant-speaking' }],
    activeSession
  );
  expect(speaking.phase).toBe('speaking');

  const interrupted = run([{ type: 'user-barge-in' }], speaking);
  expect(interrupted.phase).toBe('interrupted');

  // Replan: new user speech resumes listening in the same thread.
  const replanned = run([{ type: 'user-speech-start' }], interrupted);
  expect(replanned.phase).toBe('listening');
});

test('tool run keeps the session usable and speaking continues after finish', () => {
  const thinking = run([{ type: 'assistant-thinking' }], activeSession);
  const running = run(
    [{ type: 'tool-run-start', actionId: 'act_1' }],
    thinking
  );
  expect(running.phase).toBe('tool-running');
  expect(running.runningToolActionId).toBe('act_1');
  expect(isVoiceSessionActive(running)).toBe(true);

  const finished = run(
    [
      {
        type: 'tool-run-finish',
        actionId: 'act_1',
        receiptId: 'rcpt_1',
      },
      { type: 'assistant-speaking' },
    ],
    running
  );
  expect(finished.phase).toBe('speaking');
  expect(finished.firedActionReceiptIds).toEqual(['rcpt_1']);
});

test('duplicate action receipt cannot fire the same action twice', () => {
  const running = run(
    [
      { type: 'assistant-thinking' },
      { type: 'tool-run-start', actionId: 'act_1' },
    ],
    activeSession
  );
  const finish = {
    type: 'tool-run-finish' as const,
    actionId: 'act_1',
    receiptId: 'rcpt_1',
  };
  const once = run([finish], running);
  const twice = run([finish], once);
  expect(twice.firedActionReceiptIds).toEqual(['rcpt_1']);
});

test('transport loss reconnects to the prior phase and exhausts into degraded', () => {
  const speaking = run(
    [{ type: 'assistant-thinking' }, { type: 'assistant-speaking' }],
    activeSession
  );
  const lost = run([{ type: 'transport-lost' }], speaking);
  expect(lost.phase).toBe('reconnecting');
  expect(lost.resumePhase).toBe('speaking');

  const restored = run([{ type: 'transport-restored' }], lost);
  expect(restored.phase).toBe('speaking');

  let s = lost;
  for (let i = 0; i < MAX_VOICE_RECONNECT_ATTEMPTS; i += 1) {
    s = run([{ type: 'transport-lost' }], s);
  }
  expect(s.phase).toBe('degraded');
  expect(s.degradedReason).toBe('reconnect-exhausted');
});

test('input device loss degrades and device change recovers to listening', () => {
  const lost = run([{ type: 'input-device-lost' }], activeSession);
  expect(lost.phase).toBe('degraded');
  expect(lost.degradedReason).toBe('device-lost');

  const recovered = run([{ type: 'input-device-changed' }], lost);
  expect(recovered.phase).toBe('listening');
  expect(recovered.degradedReason).toBeUndefined();
});

test('provider outage visibly degrades an active session', () => {
  const out = run([{ type: 'provider-outage' }], activeSession);
  expect(out.phase).toBe('degraded');
  expect(out.degradedReason).toBe('provider-outage');
});

test('mute preserves the resumable phase and unmute returns to it', () => {
  const muted = run([{ type: 'mute' }], activeSession);
  expect(muted.phase).toBe('muted');
  expect(muted.muted).toBe(true);

  const unmuted = run([{ type: 'unmute' }], muted);
  expect(unmuted.phase).toBe('listening');
  expect(unmuted.muted).toBe(false);
});

test('end is honored from any phase and is terminal', () => {
  for (const state of [
    INITIAL_VOICE_SESSION_STATE,
    activeSession,
    run([{ type: 'provider-outage' }], activeSession),
  ]) {
    const ended = run([{ type: 'end' }], state);
    expect(ended.phase).toBe('ended');
    expect(isVoiceSessionActive(ended)).toBe(false);
    expect(run([{ type: 'start' }], ended).phase).toBe('ended');
  }
});

test('restart from degraded begins a clean session', () => {
  const denied = run([{ type: 'start' }, { type: 'mic-denied' }]);
  const restarted = run([{ type: 'start' }, { type: 'mic-granted' }], denied);
  expect(restarted.phase).toBe('listening');
  expect(restarted.firedActionReceiptIds).toEqual([]);
  expect(restarted.degradedReason).toBeUndefined();
});

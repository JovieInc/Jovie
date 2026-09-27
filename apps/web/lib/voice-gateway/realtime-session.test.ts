import { describe, expect, test } from 'vitest';
import {
  INITIAL_GATEWAY_STATE,
  MAX_PROVIDER_RECONNECT_ATTEMPTS,
  type RealtimeProviderDescriptor,
  reduceGatewaySession,
  resolveFailureLadder,
  selectRealtimeProvider,
  type VoiceGatewayEvent,
  type VoiceGatewayState,
} from './realtime-session';

const xai: RealtimeProviderDescriptor = {
  id: 'xai-voice-agent',
  label: 'xAI Voice Agent',
  available: true,
  measuredLatencyMs: 120,
  costPerMinUsd: 0.06,
  capabilities: {
    fullDuplex: true,
    sessionResume: true,
    toolEvents: true,
    pushToTalk: true,
  },
};

const elevenlabs: RealtimeProviderDescriptor = {
  id: 'elevenlabs-agents',
  label: 'ElevenLabs Agents',
  available: true,
  measuredLatencyMs: 240,
  costPerMinUsd: 0.11,
  capabilities: {
    fullDuplex: true,
    sessionResume: false,
    toolEvents: true,
    pushToTalk: true,
  },
};

const openai: RealtimeProviderDescriptor = {
  id: 'openai-realtime',
  label: 'OpenAI Realtime',
  available: false,
  measuredLatencyMs: 90,
  costPerMinUsd: 0.09,
  capabilities: {
    fullDuplex: true,
    sessionResume: true,
    toolEvents: true,
    pushToTalk: true,
  },
};

const dictationOnly: RealtimeProviderDescriptor = {
  id: 'apple-dictation',
  label: 'On-device dictation',
  available: true,
  capabilities: {
    fullDuplex: false,
    sessionResume: false,
    toolEvents: false,
    pushToTalk: true,
  },
};

function run(
  events: readonly VoiceGatewayEvent[],
  from: VoiceGatewayState = INITIAL_GATEWAY_STATE,
  providers: readonly RealtimeProviderDescriptor[] = []
): VoiceGatewayState {
  return events.reduce((s, e) => reduceGatewaySession(s, e, providers), from);
}

const live = run([
  { type: 'session-start' },
  { type: 'provider-attached', providerId: 'xai-voice-agent' },
]);

describe('selectRealtimeProvider', () => {
  test('picks the lowest-latency available provider that fits the requirement', () => {
    // openai is faster but unavailable; xai wins over elevenlabs on latency.
    expect(
      selectRealtimeProvider([elevenlabs, openai, xai], 'fullDuplex')?.id
    ).toBe('xai-voice-agent');
  });

  test('returns null when no available provider satisfies the requirement', () => {
    expect(selectRealtimeProvider([dictationOnly], 'fullDuplex')).toBeNull();
  });

  test('uses cost as the latency tiebreaker', () => {
    const cheap = {
      ...elevenlabs,
      id: 'cheap',
      measuredLatencyMs: 120,
      costPerMinUsd: 0.05,
    };
    const pricey = {
      ...elevenlabs,
      id: 'pricey',
      measuredLatencyMs: 120,
      costPerMinUsd: 0.2,
    };
    expect(selectRealtimeProvider([pricey, cheap], 'fullDuplex')?.id).toBe(
      'cheap'
    );
  });
});

describe('reduceGatewaySession', () => {
  test('session-start + provider-attached reaches live full-duplex', () => {
    expect(live.phase).toBe('live');
    expect(live.mode).toBe('full-duplex');
    expect(live.providerId).toBe('xai-voice-agent');
  });

  test('only final utterances and completed speech bump the revision', () => {
    const s = run(
      [
        { type: 'user-utterance', final: false, transcript: 'open a lin—' },
        {
          type: 'user-utterance',
          final: true,
          transcript: 'open a linear issue',
        },
        { type: 'assistant-speech', stage: 'chunk' },
        { type: 'assistant-speech', stage: 'complete' },
      ],
      live
    );
    expect(s.committedRevision).toBe(2);
  });

  test('tool-intent fires exactly once per actionKey across replays', () => {
    const intent: VoiceGatewayEvent = {
      type: 'tool-intent',
      actionKey: 'summer:turn-7:linear.create:abc123',
      tool: 'linear.create-issue',
    };
    const s = run([intent, intent, intent], live);
    expect(Object.keys(s.actions)).toHaveLength(1);
    expect(s.actions[intent.actionKey].status).toBe('dispatched');
    expect(s.committedRevision).toBe(1);
  });

  test('tool lifecycle records a truthful receipt independently of provider', () => {
    const actionKey = 'summer:turn-7:linear.create:abc123';
    const s = run(
      [
        { type: 'tool-intent', actionKey, tool: 'linear.create-issue' },
        { type: 'tool-progress', actionKey, summary: 'drafting issue' },
        { type: 'tool-result', actionKey, receiptId: 'rcpt-1' },
        // A reconnect-replayed result must not double-commit.
        { type: 'tool-result', actionKey, receiptId: 'rcpt-1' },
      ],
      live
    );
    expect(s.actions[actionKey]).toMatchObject({
      status: 'completed',
      receiptId: 'rcpt-1',
    });
    expect(s.committedRevision).toBe(2);
  });

  test('failure ladder: reconnect, then failover, then text', () => {
    const providers = [xai, elevenlabs, dictationOnly];
    const fail = { type: 'provider-failure', reason: 'ws-drop' } as const;

    const reconnecting = run([fail], live, providers);
    expect(reconnecting.phase).toBe('reconnecting');
    expect(reconnecting.providerId).toBe('xai-voice-agent');

    // Exhaust reconnect budget → failover to next compatible provider.
    const exhausted = run(
      Array.from({ length: MAX_PROVIDER_RECONNECT_ATTEMPTS }, () => fail),
      live,
      providers
    );
    const afterFailover = run([fail], exhausted, providers);
    expect(afterFailover.providerId).toBe('elevenlabs-agents');
    expect(afterFailover.failoverCount).toBe(1);

    // With no full-duplex alternative left, degrade to push-to-talk, then text.
    const none = resolveFailureLadder(
      { ...live, reconnectAttempts: MAX_PROVIDER_RECONNECT_ATTEMPTS },
      [dictationOnly]
    );
    expect(none).toEqual({ step: 'degrade', mode: 'push-to-talk' });
    const text = resolveFailureLadder(
      { ...live, reconnectAttempts: MAX_PROVIDER_RECONNECT_ATTEMPTS },
      []
    );
    expect(text).toEqual({ step: 'degrade', mode: 'text' });
  });

  test('reconnect resumes without replaying committed actions', () => {
    const actionKey = 'summer:turn-3:linear.create:k9';
    const committed = run(
      [
        { type: 'tool-intent', actionKey, tool: 'linear.create-issue' },
        { type: 'tool-result', actionKey, receiptId: 'rcpt-9' },
        { type: 'provider-failure', reason: 'drop' },
        { type: 'transport-restored' },
        // Provider replays the finalized intent after reconnect.
        { type: 'tool-intent', actionKey, tool: 'linear.create-issue' },
      ],
      live
    );
    expect(committed.phase).toBe('live');
    expect(committed.actions[actionKey].status).toBe('completed');
    expect(Object.keys(committed.actions)).toHaveLength(1);
  });

  test('end is honored from every phase', () => {
    expect(run([{ type: 'session-end' }], live).phase).toBe('ended');
    const ended = run(
      [{ type: 'session-end' }, { type: 'provider-failure', reason: 'x' }],
      live
    );
    expect(ended.phase).toBe('ended');
  });
});

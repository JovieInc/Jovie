/**
 * Provider-neutral realtime voice gateway core (JOV-5920).
 *
 * This module is the internal contract that realtime provider adapters
 * (ElevenLabs, xAI/Grok, OpenAI realtime, future providers) normalize into.
 * It carries no provider code: audio formats, session mechanics, tool schemas,
 * and prompts live behind adapter descriptors registered by callers.
 *
 * Owns:
 * - the normalized gateway event union adapters must emit;
 * - provider selection from measured capability/latency/cost descriptors;
 * - the failure ladder (resume → failover → push-to-talk → text);
 * - exactly-once action keys so a replayed final transcript, reconnect, or
 *   provider retry cannot fire the same tool/Linear/Symphony action twice.
 *
 * Summer/Eve remains the durable authority; this reducer only orders what the
 * session has committed so provider failover never repeats side effects.
 */

/** Providers are instances, not architecture. Adapters declare their own id. */
export type RealtimeProviderId = string;

export type GatewayMode = 'full-duplex' | 'push-to-talk' | 'text';

/** Ordered failure ladder modes once realtime providers are exhausted. */
export const GATEWAY_DEGRADED_MODES: readonly GatewayMode[] = [
  'push-to-talk',
  'text',
];

export interface RealtimeProviderCapabilities {
  /** True full-duplex audio with barge-in both directions. */
  readonly fullDuplex: boolean;
  /** Provider can resume/reconnect a session without replaying events. */
  readonly sessionResume: boolean;
  /** Provider emits first-class tool intent/result events. */
  readonly toolEvents: boolean;
  /** Provider can serve as a push-to-talk dictation leg. */
  readonly pushToTalk: boolean;
}

export interface RealtimeProviderDescriptor {
  readonly id: RealtimeProviderId;
  readonly label: string;
  readonly capabilities: RealtimeProviderCapabilities;
  /** Currently reachable; unhealthy providers are skipped by selection. */
  readonly available: boolean;
  /** Measured speech-start latency in ms, when observed. Lower wins. */
  readonly measuredLatencyMs?: number;
  /** Fully-loaded $/min; used as the latency tiebreaker. */
  readonly costPerMinUsd?: number;
}

export type VoiceGatewayEvent =
  | { readonly type: 'session-start' }
  | {
      readonly type: 'provider-attached';
      readonly providerId: RealtimeProviderId;
    }
  | {
      readonly type: 'user-utterance';
      readonly final: boolean;
      readonly transcript: string;
    }
  | {
      readonly type: 'assistant-speech';
      readonly stage: 'plan' | 'chunk' | 'complete';
    }
  | { readonly type: 'interruption'; readonly source: 'user' | 'assistant' }
  | {
      readonly type: 'tool-intent';
      /** Exactly-once key from the canonical Summer action record. */
      readonly actionKey: string;
      readonly tool: string;
    }
  | {
      readonly type: 'tool-progress';
      readonly actionKey: string;
      readonly summary: string;
    }
  | {
      readonly type: 'tool-result';
      readonly actionKey: string;
      readonly receiptId: string;
    }
  | {
      readonly type: 'tool-failure';
      readonly actionKey: string;
      readonly error: string;
    }
  | { readonly type: 'provider-failure'; readonly reason: string }
  | { readonly type: 'transport-restored' }
  | { readonly type: 'session-end' };

export type GatewaySessionPhase =
  | 'idle'
  | 'live'
  | 'reconnecting'
  | 'degraded'
  | 'ended';

export interface CommittedAction {
  readonly actionKey: string;
  readonly tool: string;
  readonly status: 'dispatched' | 'running' | 'completed' | 'failed';
  readonly receiptId?: string;
}

export interface VoiceGatewayState {
  readonly phase: GatewaySessionPhase;
  readonly mode: GatewayMode;
  readonly providerId: RealtimeProviderId | null;
  readonly reconnectAttempts: number;
  readonly failoverCount: number;
  /** Revision-ordered count of committed conversation actions. */
  readonly committedRevision: number;
  /** actionKey → committed action ledger; the dedupe source of truth. */
  readonly actions: Readonly<Record<string, CommittedAction>>;
  /** Set when the ladder reached push-to-talk/text. */
  readonly degradedTo?: GatewayMode;
}

export const INITIAL_GATEWAY_STATE: VoiceGatewayState = {
  phase: 'idle',
  mode: 'full-duplex',
  providerId: null,
  reconnectAttempts: 0,
  failoverCount: 0,
  committedRevision: 0,
  actions: {},
};

export const MAX_PROVIDER_RECONNECT_ATTEMPTS = 2;

/**
 * Select a realtime provider for a session. Selection is by measured
 * capability fit, then latency, then cost — never novelty. Returns null when
 * no available provider satisfies the requirement.
 */
export function selectRealtimeProvider(
  providers: readonly RealtimeProviderDescriptor[],
  require: keyof RealtimeProviderCapabilities
): RealtimeProviderDescriptor | null {
  const candidates = providers.filter(
    p => p.available && p.capabilities[require]
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, next) => {
    const bestLatency = best.measuredLatencyMs ?? Number.MAX_SAFE_INTEGER;
    const nextLatency = next.measuredLatencyMs ?? Number.MAX_SAFE_INTEGER;
    if (nextLatency !== bestLatency) {
      return nextLatency < bestLatency ? next : best;
    }
    const bestCost = best.costPerMinUsd ?? Number.MAX_SAFE_INTEGER;
    const nextCost = next.costPerMinUsd ?? Number.MAX_SAFE_INTEGER;
    return nextCost < bestCost ? next : best;
  });
}

/**
 * Resolve the next rung of the failure ladder after a provider failure:
 * 1. resume/reconnect the current provider,
 * 2. fail over to another compatible realtime provider,
 * 3. degrade to push-to-talk,
 * 4. degrade to text (same Summer thread, same tool capability).
 */
export function resolveFailureLadder(
  state: VoiceGatewayState,
  providers: readonly RealtimeProviderDescriptor[]
):
  | { readonly step: 'reconnect' }
  | { readonly step: 'failover'; readonly providerId: RealtimeProviderId }
  | { readonly step: 'degrade'; readonly mode: 'push-to-talk' | 'text' } {
  if (
    state.providerId !== null &&
    state.reconnectAttempts < MAX_PROVIDER_RECONNECT_ATTEMPTS
  ) {
    return { step: 'reconnect' };
  }
  const failover = selectRealtimeProvider(
    providers.filter(p => p.id !== state.providerId),
    'fullDuplex'
  );
  if (failover) return { step: 'failover', providerId: failover.id };
  const ptt = selectRealtimeProvider(providers, 'pushToTalk');
  return {
    step: 'degrade',
    mode: ptt ? 'push-to-talk' : 'text',
  };
}

export function reduceGatewaySession(
  state: VoiceGatewayState,
  event: VoiceGatewayEvent,
  providers: readonly RealtimeProviderDescriptor[] = []
): VoiceGatewayState {
  if (state.phase === 'ended') return state;
  if (event.type === 'session-end') {
    return { ...state, phase: 'ended' };
  }

  switch (event.type) {
    case 'session-start':
      if (state.phase !== 'idle') return state;
      return {
        ...INITIAL_GATEWAY_STATE,
        phase: 'reconnecting',
        actions: state.actions,
        committedRevision: state.committedRevision,
      };

    case 'provider-attached':
      if (state.phase !== 'reconnecting' && state.phase !== 'idle') {
        return state;
      }
      return {
        ...state,
        phase: 'live',
        mode: 'full-duplex',
        providerId: event.providerId,
        reconnectAttempts: 0,
        degradedTo: undefined,
      };

    case 'user-utterance': {
      if (state.phase !== 'live' && state.phase !== 'degraded') return state;
      // Partial transcripts are ephemeral provider state; only finals commit.
      if (!event.final) return state;
      return { ...state, committedRevision: state.committedRevision + 1 };
    }

    case 'assistant-speech':
      if (state.phase !== 'live' || event.stage !== 'complete') return state;
      return { ...state, committedRevision: state.committedRevision + 1 };

    case 'interruption':
      // Interruptions are latency-critical UI facts, not committed work.
      return state;

    case 'tool-intent': {
      if (state.phase !== 'live' && state.phase !== 'degraded') return state;
      // Exactly-once: a duplicate actionKey (replay, reconnect, provider
      // retry, or a re-finalized utterance) is recorded but never refires.
      if (state.actions[event.actionKey]) return state;
      return {
        ...state,
        committedRevision: state.committedRevision + 1,
        actions: {
          ...state.actions,
          [event.actionKey]: {
            actionKey: event.actionKey,
            tool: event.tool,
            status: 'dispatched',
          },
        },
      };
    }

    case 'tool-progress': {
      const action = state.actions[event.actionKey];
      if (!action || action.status !== 'dispatched') return state;
      return {
        ...state,
        actions: {
          ...state.actions,
          [event.actionKey]: { ...action, status: 'running' },
        },
      };
    }

    case 'tool-result':
    case 'tool-failure': {
      const action = state.actions[event.actionKey];
      if (
        !action ||
        action.status === 'completed' ||
        action.status === 'failed'
      ) {
        return state;
      }
      const status = event.type === 'tool-result' ? 'completed' : 'failed';
      const receiptId =
        event.type === 'tool-result' ? event.receiptId : undefined;
      return {
        ...state,
        committedRevision: state.committedRevision + 1,
        actions: {
          ...state.actions,
          [event.actionKey]: { ...action, status, receiptId },
        },
      };
    }

    case 'provider-failure': {
      if (state.phase !== 'live' && state.phase !== 'reconnecting') {
        return state;
      }
      const next = resolveFailureLadder(state, providers);
      switch (next.step) {
        case 'reconnect':
          return {
            ...state,
            phase: 'reconnecting',
            reconnectAttempts: state.reconnectAttempts + 1,
          };
        case 'failover':
          return {
            ...state,
            phase: 'reconnecting',
            providerId: next.providerId,
            reconnectAttempts: 0,
            failoverCount: state.failoverCount + 1,
          };
        case 'degrade':
          return {
            ...state,
            phase: 'degraded',
            mode: next.mode,
            degradedTo: next.mode,
          };
      }
      return state;
    }

    case 'transport-restored': {
      if (state.phase !== 'reconnecting') return state;
      // Resume without replaying committed actions: the ledger survives.
      return { ...state, phase: 'live', reconnectAttempts: 0 };
    }

    default:
      return state;
  }
}

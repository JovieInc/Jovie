/**
 * Provider-neutral Ovi desktop voice session state machine (JOV-4693).
 *
 * Owns only the client-side session contract: truthful phases, barge-in,
 * reconnect budget, degradation to a valid fallback mode, and dedupe of
 * fired action receipts. Provider audio/session specifics stay behind the
 * JOV-5920 realtime gateway adapters; this module carries no provider code.
 */

export type VoiceSessionPhase =
  | 'idle'
  | 'requesting-mic'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'tool-running'
  | 'reconnecting'
  | 'degraded'
  | 'muted'
  | 'ended';

export type VoiceDegradedReason =
  | 'microphone-denied'
  | 'device-lost'
  | 'provider-outage'
  | 'reconnect-exhausted';

/** Voice degrades to the same thread's text mode; never an orphan surface. */
export const VOICE_DEGRADED_FALLBACK = 'text' as const;

export const MAX_VOICE_RECONNECT_ATTEMPTS = 5;

/** Phases an active session can resume into after mute/reconnect. */
export type VoiceResumablePhase =
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'tool-running';

export interface VoiceSessionState {
  readonly phase: VoiceSessionPhase;
  /** Phase to return to when muted/reconnecting resolves. */
  readonly resumePhase: VoiceResumablePhase;
  readonly muted: boolean;
  readonly reconnectAttempts: number;
  readonly degradedReason?: VoiceDegradedReason;
  /** Tool/Symphony action currently executing while talk continues. */
  readonly runningToolActionId?: string;
  /** receiptIds already fired; duplicates (replay/reconnect) are dropped. */
  readonly firedActionReceiptIds: readonly string[];
}

export type VoiceSessionEvent =
  | { readonly type: 'start' }
  | { readonly type: 'mic-granted' }
  | { readonly type: 'mic-denied' }
  | { readonly type: 'user-speech-start' }
  | { readonly type: 'user-barge-in' }
  | { readonly type: 'assistant-thinking' }
  | { readonly type: 'assistant-speaking' }
  | { readonly type: 'tool-run-start'; readonly actionId: string }
  | {
      readonly type: 'tool-run-finish';
      readonly actionId: string;
      readonly receiptId: string;
    }
  | { readonly type: 'provider-outage' }
  | { readonly type: 'transport-lost' }
  | { readonly type: 'transport-restored' }
  | { readonly type: 'input-device-lost' }
  | { readonly type: 'input-device-changed' }
  | { readonly type: 'mute' }
  | { readonly type: 'unmute' }
  | { readonly type: 'end' };

export const INITIAL_VOICE_SESSION_STATE: VoiceSessionState = {
  phase: 'idle',
  resumePhase: 'listening',
  muted: false,
  reconnectAttempts: 0,
  firedActionReceiptIds: [],
};

const ACTIVE_PHASES: ReadonlySet<VoiceSessionPhase> = new Set([
  'listening',
  'thinking',
  'speaking',
  'interrupted',
  'tool-running',
  'reconnecting',
  'muted',
]);

const RESUMABLE_PHASES: ReadonlySet<VoiceSessionPhase> = new Set([
  'listening',
  'thinking',
  'speaking',
  'tool-running',
]);

function degrade(
  state: VoiceSessionState,
  degradedReason: VoiceDegradedReason
): VoiceSessionState {
  return { ...state, phase: 'degraded', degradedReason };
}

export function isVoiceSessionActive(state: VoiceSessionState): boolean {
  return ACTIVE_PHASES.has(state.phase);
}

export function reduceVoiceSession(
  state: VoiceSessionState,
  event: VoiceSessionEvent
): VoiceSessionState {
  if (state.phase === 'ended') return state;

  // The voice overlay is never an orphan: end is honored from every phase.
  if (event.type === 'end') return { ...state, phase: 'ended' };

  switch (event.type) {
    case 'start':
      if (state.phase !== 'idle' && state.phase !== 'degraded') return state;
      return {
        ...INITIAL_VOICE_SESSION_STATE,
        phase: 'requesting-mic',
      };

    case 'mic-granted':
      if (state.phase !== 'requesting-mic') return state;
      return { ...state, phase: 'listening' };

    case 'mic-denied':
      if (state.phase !== 'requesting-mic') return state;
      return degrade(state, 'microphone-denied');

    case 'user-speech-start':
      if (!['listening', 'interrupted'].includes(state.phase)) return state;
      return { ...state, phase: 'listening' };

    case 'assistant-thinking':
      if (!['listening', 'interrupted'].includes(state.phase)) return state;
      return { ...state, phase: 'thinking' };

    case 'assistant-speaking':
      if (!['thinking', 'tool-running'].includes(state.phase)) return state;
      return { ...state, phase: 'speaking' };

    case 'tool-run-start':
      if (!['thinking', 'speaking', 'listening'].includes(state.phase)) {
        return state;
      }
      return {
        ...state,
        phase: 'tool-running',
        runningToolActionId: event.actionId,
      };

    case 'tool-run-finish': {
      // Idempotent: a replayed final transcript or reconnect must not fire
      // the same action twice.
      if (state.firedActionReceiptIds.includes(event.receiptId)) {
        return state.phase === 'tool-running'
          ? { ...state, runningToolActionId: undefined }
          : state;
      }
      return {
        ...state,
        phase: state.phase === 'tool-running' ? 'thinking' : state.phase,
        runningToolActionId: undefined,
        firedActionReceiptIds: [
          ...state.firedActionReceiptIds,
          event.receiptId,
        ],
      };
    }

    // Immediate barge-in: stop speaking/thinking and replan from interrupted.
    case 'user-barge-in':
      if (!['speaking', 'thinking', 'tool-running'].includes(state.phase)) {
        return state;
      }
      return { ...state, phase: 'interrupted' };

    case 'provider-outage':
      if (!isVoiceSessionActive(state)) return state;
      return degrade(state, 'provider-outage');

    case 'transport-lost': {
      if (!ACTIVE_PHASES.has(state.phase) && state.phase !== 'degraded') {
        return state;
      }
      const reconnectAttempts = state.reconnectAttempts + 1;
      if (reconnectAttempts > MAX_VOICE_RECONNECT_ATTEMPTS) {
        return degrade({ ...state, reconnectAttempts }, 'reconnect-exhausted');
      }
      const resumePhase = RESUMABLE_PHASES.has(state.phase)
        ? (state.phase as VoiceResumablePhase)
        : state.resumePhase;
      return {
        ...state,
        phase: 'reconnecting',
        reconnectAttempts,
        resumePhase,
      };
    }

    case 'transport-restored':
      if (state.phase !== 'reconnecting') return state;
      return { ...state, phase: state.resumePhase };

    case 'input-device-lost':
      if (!isVoiceSessionActive(state)) return state;
      return degrade(state, 'device-lost');

    case 'input-device-changed':
      if (
        state.phase === 'degraded' &&
        state.degradedReason === 'device-lost'
      ) {
        return {
          ...state,
          phase: 'listening',
          degradedReason: undefined,
          reconnectAttempts: 0,
        };
      }
      return state;

    case 'mute': {
      if (!RESUMABLE_PHASES.has(state.phase)) return state;
      return {
        ...state,
        phase: 'muted',
        muted: true,
        resumePhase: state.phase as VoiceResumablePhase,
      };
    }

    case 'unmute':
      if (state.phase !== 'muted') return state;
      return { ...state, phase: state.resumePhase, muted: false };

    default:
      return state;
  }
}

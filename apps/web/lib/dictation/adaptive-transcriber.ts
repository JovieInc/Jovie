import {
  isWebSpeechTranscriptionSupported,
  joinDictationText,
  type Transcriber,
  type TranscriberCallbacks,
} from '@/lib/chat/transcriber';
import {
  INITIAL_GATEWAY_STATE,
  resolveFailureLadder,
} from '@/lib/voice-gateway/realtime-session';
import { DictationError } from './errors';
import { createDictationRegistry } from './registry';
import {
  DICTATION_MIC_CONSTRAINTS,
  type DictationErrorCode,
  type DictationProvider,
  type SttStream,
  type TtsStream,
} from './types';
import { createWebSpeechProvider } from './web-speech';

export interface AdaptiveTranscriberOptions {
  providers?: readonly DictationProvider[];
  runtime?: 'web' | 'electron';
  lang?: string;
  browserWindow?: Window;
  getMicrophone?: () => Promise<MediaStream>;
  activeTts?: () => TtsStream | null;
  onFallback?: (code: DictationErrorCode) => void;
}
const TERMINAL_ERRORS = new Set<DictationErrorCode>([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'quota',
  'rate_limited',
  'dictation_cap_reached',
]);

/** Uses the gateway's reconnect → failover → text ladder; finals survive reconnect. */
export function createAdaptiveTranscriber(
  callbacks: TranscriberCallbacks,
  options: AdaptiveTranscriberOptions = {}
): Transcriber {
  const providers = createDictationRegistry(
    options.providers ??
      (isWebSpeechTranscriptionSupported(options.browserWindow)
        ? [createWebSpeechProvider(options)]
        : []),
    options.runtime ?? 'web'
  );
  let generation = 0;
  let attempt = 0;
  let controller: AbortController | null = null;
  let stream: SttStream | null = null;
  let mic: MediaStream | null = null;
  let unsubscribe: (() => void) | undefined;
  let committed = new Map<string, string>();
  let stopping = false;
  const release = () => {
    for (const track of mic?.getTracks() ?? []) track.stop();
    mic = null;
  };
  const detach = () => {
    unsubscribe?.();
    unsubscribe = undefined;
    controller?.abort();
    stream?.abort();
    stream = null;
  };
  const finish = () => {
    generation++;
    detach();
    release();
    callbacks.onEnd?.();
  };
  const terminal = (code: DictationErrorCode) => {
    generation++;
    detach();
    release();
    if (
      !['not-allowed', 'service-not-allowed', 'audio-capture'].includes(code)
    ) {
      options.onFallback?.(code);
    }
    callbacks.onError?.(
      code === 'quota' ||
        code === 'rate_limited' ||
        code === 'dictation_cap_reached' ||
        code === 'token' ||
        code === 'provider-down'
        ? 'network'
        : code
    );
    callbacks.onEnd?.();
  };
  const open = async (index: number, session: number): Promise<void> => {
    const provider = providers[index];
    if (!provider || stopping) {
      if (session === generation) terminal('provider-down');
      return;
    }
    const fail = (code: DictationErrorCode) => {
      if (session !== generation) return;
      if (stopping || TERMINAL_ERRORS.has(code)) {
        terminal(code);
        return;
      }
      detach();
      const next = resolveFailureLadder(
        {
          ...INITIAL_GATEWAY_STATE,
          providerId: provider.id,
          reconnectAttempts: attempt,
        },
        providers.slice(index + 1).map((candidate, rank) => ({
          id: candidate.id,
          label: candidate.id,
          available: true,
          measuredLatencyMs: rank,
          capabilities: {
            fullDuplex: true,
            sessionResume: false,
            toolEvents: false,
            pushToTalk: false,
          },
        })),
        1
      );
      if (next.step === 'reconnect') {
        attempt++;
        void open(index, ++generation);
      } else if (next.step === 'failover') {
        attempt = 0;
        void open(
          providers.findIndex(p => p.id === next.providerId),
          ++generation
        );
      } else terminal(code);
    };
    try {
      if (!(await provider.health())) {
        if (session === generation) {
          attempt = 1;
          fail('provider-down');
        }
        return;
      }
      if (session !== generation) return;
      if (!mic && provider.id !== 'web-speech') {
        const acquired = await (options.getMicrophone?.() ??
          navigator.mediaDevices.getUserMedia({
            audio: DICTATION_MIC_CONSTRAINTS,
          }));
        if (session !== generation) {
          for (const track of acquired.getTracks()) track.stop();
          return;
        }
        mic = acquired;
      }
      controller = new AbortController();
      const opened = await provider.openStream?.(mic, controller.signal);
      if (session !== generation) {
        opened?.abort();
        return;
      }
      if (!opened) {
        fail('provider-down');
        return;
      }
      stream = opened;
      unsubscribe = opened.subscribe(event => {
        if (session !== generation) return;
        if (event.type === 'speech') options.activeTts?.()?.cancel();
        if (event.type === 'partial') {
          if (event.text.trim()) options.activeTts?.()?.cancel();
          callbacks.onTranscript(
            joinDictationText([...committed.values()].join(' '), event.text)
          );
        }
        if (event.type === 'committed' && !committed.has(event.segmentId)) {
          committed.set(event.segmentId, event.text);
          callbacks.onTranscript([...committed.values()].join(' '));
        }
        if (event.type === 'error') fail(event.code);
        if (event.type === 'closed') finish();
      });
    } catch (error) {
      fail(
        error instanceof DictationError
          ? error.code
          : error instanceof DOMException &&
              (error.name === 'NotAllowedError' ||
                error.name === 'SecurityError')
            ? 'not-allowed'
            : 'network'
      );
    }
  };
  const cancel = () => {
    generation++;
    stopping = true;
    detach();
    release();
  };
  return {
    isSupported: providers.length > 0,
    start() {
      cancel();
      stopping = false;
      attempt = 0;
      committed = new Map();
      void open(0, ++generation);
    },
    stop() {
      stopping = true;
      if (stream) {
        stream.commit();
        stream.close();
      } else {
        generation++;
        finish();
      }
    },
    cancel,
    dispose: cancel,
  };
}

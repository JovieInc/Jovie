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
import { DICTATION_LIMITS } from './limits';
import { createDictationRecording, type DictationRecording } from './recorder';
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
  createRecording?: (mic: MediaStream) => DictationRecording;
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
  let stopRequested = false;
  let recording: DictationRecording | null = null;
  let recordedBlob: Blob | null = null;
  let recordingResult: Promise<Blob> | null = null;
  let batchStop: (() => void) | null = null;
  let sessionTimer: ReturnType<typeof setTimeout> | undefined;
  const release = () => {
    clearTimeout(sessionTimer);
    recording?.abort();
    recording = null;
    batchStop = null;
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
    recordedBlob = null;
    recordingResult = null;
    callbacks.onEnd?.();
  };
  const terminal = (code: DictationErrorCode) => {
    generation++;
    detach();
    release();
    recordedBlob = null;
    recordingResult = null;
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
      if (TERMINAL_ERRORS.has(code)) {
        terminal(code);
        return;
      }
      if (stopRequested) {
        const batchIndex = providers.findIndex(
          (candidate, position) =>
            position > index && candidate.capabilities.batch
        );
        if (recording && batchIndex >= 0 && !provider.capabilities.batch) {
          detach();
          stopping = false;
          attempt = 0;
          void open(batchIndex, ++generation);
        } else terminal(code);
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
      if (
        !mic &&
        !recordedBlob &&
        !recordingResult &&
        provider.id !== 'web-speech'
      ) {
        const acquired = await (options.getMicrophone?.() ??
          navigator.mediaDevices.getUserMedia({
            audio: DICTATION_MIC_CONSTRAINTS,
          }));
        if (session !== generation) {
          for (const track of acquired.getTracks()) track.stop();
          return;
        }
        mic = acquired;
        if (
          providers.some(p => p.capabilities.batch) &&
          (options.createRecording || typeof MediaRecorder !== 'undefined')
        ) {
          try {
            recording = (options.createRecording ?? createDictationRecording)(
              mic
            );
          } catch {
            recording = null;
          }
        }
      }
      controller = new AbortController();
      if (provider.transcribe && provider.capabilities.batch) {
        if (!recording && !recordedBlob && !recordingResult) {
          attempt = 1;
          fail('provider-down');
          return;
        }
        const batchSignal = controller.signal;
        let submitted = false;
        batchStop = () => {
          if (submitted || session !== generation) return;
          submitted = true;
          void (async () => {
            try {
              const blob =
                recordedBlob ?? (await (recordingResult ?? recording?.stop()));
              if (!blob || session !== generation) return;
              recordedBlob = blob;
              release();
              const text = await provider.transcribe?.(blob, batchSignal);
              if (session !== generation || batchSignal.aborted) return;
              // Batch covers the entire buffered session, replacing streaming
              // segments instead of appending them and duplicating speech.
              if (text !== undefined) callbacks.onTranscript(text);
              finish();
            } catch (error) {
              fail(
                error instanceof DictationError ? error.code : 'provider-down'
              );
            }
          })();
        };
        if (stopRequested) {
          stopping = true;
          batchStop();
        }
        return;
      }
      batchStop = null;
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
    recordedBlob = null;
    recordingResult = null;
  };
  const stop = () => {
    stopRequested = true;
    stopping = true;
    clearTimeout(sessionTimer);
    if (recording && !recordingResult) {
      recordingResult = recording.stop();
      const capturedMic = mic;
      const stopTracks = () => {
        if (mic !== capturedMic) return;
        for (const track of capturedMic?.getTracks() ?? []) track.stop();
        mic = null;
      };
      void recordingResult.then(stopTracks, stopTracks);
    }
    if (batchStop) batchStop();
    else if (stream) {
      stream.commit();
      stream.close();
    } else if (recording) {
      const batchIndex = providers.findIndex(
        provider => provider.capabilities.batch
      );
      if (batchIndex >= 0) {
        detach();
        stopping = false;
        attempt = 0;
        void open(batchIndex, ++generation);
      } else finish();
    } else {
      generation++;
      finish();
    }
  };
  return {
    isSupported: providers.length > 0,
    start() {
      cancel();
      stopping = false;
      stopRequested = false;
      attempt = 0;
      committed = new Map();
      recordedBlob = null;
      recordingResult = null;
      sessionTimer = setTimeout(
        stop,
        DICTATION_LIMITS.maxSessionSeconds * 1000
      );
      void open(0, ++generation);
    },
    stop,
    cancel,
    dispose: cancel,
  };
}

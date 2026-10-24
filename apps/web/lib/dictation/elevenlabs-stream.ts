import { CSRF_HEADER_NAME, getBrowserCsrfToken } from '@/lib/security/csrf';
import { DictationError } from './errors';
import { DICTATION_LIMITS } from './limits';
import { capturePcm } from './pcm-capture';
import type { DictationErrorCode, DictationProvider, SttEvent } from './types';

interface TokenResponse {
  token: string;
  expiresAt: number;
  wsUrl: string;
  modelId: string;
  maxSessionSec: number;
}
interface StreamOptions {
  fetch?: typeof fetch;
  socket?: (url: string) => WebSocket;
  capture?: typeof capturePcm;
}
const WS_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
export function normalizeScribeError(type: string): DictationErrorCode {
  if (type === 'rate_limited' || type === 'throttled') return 'rate_limited';
  if (type === 'quota_exceeded') return 'quota';
  if (type === 'auth_error') return 'token';
  if (type === 'session_time_limit_exceeded') return 'dictation_cap_reached';
  return 'provider-down';
}
export function createElevenLabsStreamProvider(
  options: StreamOptions = {}
): DictationProvider {
  return {
    id: 'elevenlabs-stream',
    capabilities: {
      streaming: true,
      partials: true,
      batch: false,
      languages: ['auto'],
      maxSessionSec: DICTATION_LIMITS.maxSessionSeconds,
      fullDuplexSafe: false,
      runsIn: ['web', 'electron'],
    },
    health: () =>
      typeof globalThis.WebSocket !== 'undefined' &&
      typeof globalThis.AudioContext !== 'undefined',
    async openStream(mic, signal) {
      if (!mic) throw new DictationError('audio-capture');
      const csrfToken = getBrowserCsrfToken();
      const response = await (options.fetch ?? fetch)('/api/dictation/token', {
        method: 'POST',
        headers: csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : undefined,
        signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        const data: { code?: string } = await response.json().catch(() => ({}));
        throw new DictationError(
          data.code === 'dictation_cap_reached' || data.code === 'rate_limited'
            ? data.code
            : 'token'
        );
      }
      const token: TokenResponse = await response.json();
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (
        token.wsUrl !== WS_URL ||
        token.modelId !== 'scribe_v2_realtime' ||
        typeof token.token !== 'string' ||
        !token.token ||
        !Number.isFinite(token.maxSessionSec) ||
        token.maxSessionSec <= 0 ||
        token.expiresAt <= Date.now()
      )
        throw new DictationError('token');
      const url = new URL(WS_URL);
      url.searchParams.set('token', token.token);
      url.searchParams.set('model_id', token.modelId);
      url.searchParams.set('audio_format', 'pcm_16000');
      url.searchParams.set('commit_strategy', 'vad');
      // Omit language_code to use provider auto-detection.
      const socket = (options.socket ?? (address => new WebSocket(address)))(
        url.toString()
      );
      const listeners = new Set<(event: SttEvent) => void>();
      const localController = new AbortController();
      let closed = false;
      let stopping = false;
      let commitPending = false;
      let segment = 0;
      const connectionId = crypto.randomUUID();
      let sampleCount = 0;
      let stopCapture: (() => void) | undefined;
      let finalTimer: ReturnType<typeof setTimeout> | undefined;
      const emit = (event: SttEvent) => {
        if (!closed) for (const listener of listeners) listener(event);
      };
      const cleanup = () => {
        clearTimeout(maxTimer);
        clearTimeout(connectTimer);
        clearTimeout(finalTimer);
        localController.abort();
        stopCapture?.();
        socket.close();
        signal.removeEventListener('abort', abort);
      };
      const abort = () => {
        if (closed) return;
        closed = true;
        cleanup();
        listeners.clear();
      };
      const end = () => {
        if (closed) return;
        emit({ type: 'closed' });
        abort();
      };
      const fail = (code: DictationErrorCode) => {
        emit({ type: 'error', code });
        abort();
      };
      const send = (audio: Int16Array, commit = false) => {
        if (closed || socket.readyState !== 1) return;
        if (!commit && stopping) return;
        sampleCount += audio.length;
        if (
          sampleCount >
          Math.min(token.maxSessionSec, DICTATION_LIMITS.maxSessionSeconds) *
            16000
        ) {
          close();
          return;
        }
        const bytes = new Uint8Array(audio.length * 2);
        const view = new DataView(bytes.buffer);
        audio.forEach((value, index) => view.setInt16(index * 2, value, true));
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        socket.send(
          JSON.stringify({
            message_type: 'input_audio_chunk',
            audio_base_64: btoa(binary),
            sample_rate: 16000,
            commit,
          })
        );
      };
      const commit = () => {
        if (!closed && !commitPending) {
          commitPending = true;
          send(new Int16Array(0), true);
        }
      };
      const close = () => {
        if (closed || stopping) return;
        stopping = true;
        localController.abort();
        stopCapture?.();
        if (socket.readyState !== 1) {
          end();
          return;
        }
        commit();
        // Preserve the provider's final before closing; bound a silent socket.
        finalTimer = setTimeout(end, 2000);
      };
      const maxTimer = setTimeout(
        close,
        Math.min(token.maxSessionSec, DICTATION_LIMITS.maxSessionSeconds) * 1000
      );
      const connectTimer = setTimeout(() => fail('network'), 10000);
      signal.addEventListener('abort', abort, { once: true });
      socket.onopen = () => {
        clearTimeout(connectTimer);
        if (closed) return;
        void (options.capture ?? capturePcm)(
          mic,
          samples => send(samples),
          localController.signal
        )
          .then(dispose => {
            if (closed || stopping) dispose();
            else stopCapture = dispose;
          })
          .catch(() => {
            if (!closed && !stopping) fail('audio-capture');
          });
      };
      socket.onmessage = event => {
        if (closed || typeof event.data !== 'string') return;
        try {
          const data = JSON.parse(event.data) as {
            message_type?: string;
            text?: string;
            segment_id?: string;
            session_id?: string;
          };
          if (
            data.message_type === 'partial_transcript' &&
            typeof data.text === 'string'
          )
            emit({ type: 'partial', text: data.text });
          else if (
            data.message_type === 'committed_transcript' &&
            typeof data.text === 'string'
          ) {
            commitPending = false;
            emit({
              type: 'committed',
              text: data.text,
              segmentId: data.segment_id ?? `${connectionId}:${++segment}`,
            });
            if (stopping) end();
          } else if (
            data.message_type &&
            ![
              'session_started',
              'warning',
              'committed_transcript_with_timestamps',
            ].includes(data.message_type)
          )
            fail(normalizeScribeError(data.message_type));
        } catch {
          fail('provider-down');
        }
      };
      socket.onerror = () => fail('network');
      socket.onclose = () => {
        if (!closed) {
          if (stopping) end();
          else fail('network');
        }
      };
      return {
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        push: send,
        commit,
        close,
        abort,
      };
    },
  };
}

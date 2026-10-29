'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  encodeAudioChunk,
  encodeInit,
  encodePong,
  encodeToolResult,
  float32ToPcm16Base64,
  parseServerMessage,
  pcm16Base64ToFloat32,
  VoiceLatencyTracker,
} from '@/lib/ovie/summer-voice-protocol';

export type SummerVoiceStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'error';

export interface SummerVoiceState {
  readonly status: SummerVoiceStatus;
  readonly errorCode: string | null;
  readonly transcript: string;
  readonly reply: string;
  readonly lastTurnMs: number | null;
}

const IDLE: SummerVoiceState = {
  status: 'idle',
  errorCode: null,
  transcript: '',
  reply: '',
  lastTurnMs: null,
};

interface Live {
  ws: WebSocket;
  stream: MediaStream;
  context: AudioContext;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  playing: Set<AudioBufferSourceNode>;
  nextStart: number;
  outputRate: number;
}

/**
 * Full-duplex Summer voice: mic -> provider WebSocket -> speaker, with
 * barge-in (the provider's `interruption` stops queued playback immediately).
 * Facts come from the `ask_summer` client tool against our own endpoint.
 */
export function useSummerVoice(): {
  readonly state: SummerVoiceState;
  readonly start: () => Promise<void>;
  readonly stop: () => void;
} {
  const [state, setState] = useState<SummerVoiceState>(IDLE);
  const liveRef = useRef<Live | null>(null);
  const tracker = useRef(new VoiceLatencyTracker());

  const stop = useCallback(() => {
    const live = liveRef.current;
    liveRef.current = null;
    if (live) {
      try {
        live.processor.disconnect();
        live.source.disconnect();
        for (const node of live.playing) node.stop();
        live.stream.getTracks().forEach(track => track.stop());
        live.ws.close();
        void live.context.close();
      } catch {
        // already torn down
      }
    }
    setState(IDLE);
  }, []);

  useEffect(() => stop, [stop]);

  const fail = useCallback((errorCode: string) => {
    const live = liveRef.current;
    liveRef.current = null;
    if (live) {
      try {
        live.stream.getTracks().forEach(track => track.stop());
        live.ws.close();
        void live.context.close();
      } catch {
        // ignore
      }
    }
    setState({ ...IDLE, status: 'error', errorCode });
  }, []);

  const start = useCallback(async () => {
    if (liveRef.current) return;
    setState({ ...IDLE, status: 'connecting' });
    try {
      const sessionResponse = await fetch('/api/ovie/summer-voice/session', {
        method: 'POST',
        cache: 'no-store',
      });
      if (!sessionResponse.ok) {
        const body = (await sessionResponse.json().catch(() => ({}))) as {
          error?: string;
        };
        fail(body.error ?? 'voice_unavailable');
        return;
      }
      const session = (await sessionResponse.json()) as { signedUrl: string };
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const context = new AudioContext({ sampleRate: 16_000 });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const ws = new WebSocket(session.signedUrl);
      const live: Live = {
        ws,
        stream,
        context,
        processor,
        source,
        playing: new Set(),
        nextStart: 0,
        outputRate: 16_000,
      };
      liveRef.current = live;

      const flushPlayback = () => {
        for (const node of live.playing) {
          try {
            node.stop();
          } catch {
            // already ended
          }
        }
        live.playing.clear();
        live.nextStart = 0;
      };

      processor.onaudioprocess = event => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(
          encodeAudioChunk(
            float32ToPcm16Base64(event.inputBuffer.getChannelData(0))
          )
        );
      };

      ws.onopen = () => {
        ws.send(encodeInit());
        source.connect(processor);
        processor.connect(context.destination);
        setState(s => ({ ...s, status: 'listening' }));
      };
      ws.onerror = () => fail('voice_connection_failed');
      ws.onclose = () => {
        if (liveRef.current === live) stop();
      };
      ws.onmessage = async message => {
        const action = parseServerMessage(String(message.data));
        if (!action) return;
        switch (action.kind) {
          case 'metadata':
            live.outputRate = action.outputRate;
            break;
          case 'ping':
            ws.send(encodePong(action.eventId));
            break;
          case 'user-transcript':
            tracker.current.userFinal(performance.now());
            setState(s => ({ ...s, transcript: action.text, reply: '' }));
            break;
          case 'agent-response':
            setState(s => ({ ...s, reply: action.text }));
            break;
          case 'interruption':
            tracker.current.interrupted();
            flushPlayback();
            setState(s => ({ ...s, status: 'listening' }));
            break;
          case 'audio': {
            const turnMs = tracker.current.firstAudio(performance.now());
            const samples = pcm16Base64ToFloat32(action.base64);
            const buffer = context.createBuffer(
              1,
              samples.length,
              live.outputRate
            );
            buffer.copyToChannel(new Float32Array(samples), 0);
            const node = context.createBufferSource();
            node.buffer = buffer;
            node.connect(context.destination);
            const startAt = Math.max(context.currentTime, live.nextStart);
            node.start(startAt);
            live.nextStart = startAt + buffer.duration;
            live.playing.add(node);
            node.onended = () => {
              live.playing.delete(node);
              if (live.playing.size === 0) {
                setState(s =>
                  s.status === 'speaking' ? { ...s, status: 'listening' } : s
                );
              }
            };
            setState(s => ({
              ...s,
              status: 'speaking',
              lastTurnMs: turnMs ?? s.lastTurnMs,
            }));
            break;
          }
          case 'tool-call': {
            if (action.name !== 'ask_summer' || !action.question) {
              ws.send(
                encodeToolResult(action.toolCallId, 'unknown tool', true)
              );
              break;
            }
            try {
              const response = await fetch('/api/ovie/summer-voice/ask', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ question: action.question }),
                cache: 'no-store',
              });
              const body = (await response.json()) as { text?: string };
              ws.send(
                response.ok && body.text
                  ? encodeToolResult(action.toolCallId, body.text, false)
                  : encodeToolResult(
                      action.toolCallId,
                      'Summer did not answer. Try again.',
                      true
                    )
              );
            } catch {
              ws.send(
                encodeToolResult(
                  action.toolCallId,
                  'Summer did not answer. Try again.',
                  true
                )
              );
            }
            break;
          }
        }
      };
    } catch (error) {
      const denied =
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      fail(denied ? 'microphone_denied' : 'voice_start_failed');
    }
  }, [fail, stop]);

  return { state, start, stop };
}

/**
 * Pure helpers for the Summer voice client: the ElevenLabs Agents WebSocket
 * message shapes, PCM16 audio conversion, and the latency tracker. No browser
 * globals except base64 (atob/btoa), so everything here is unit-tested.
 */

export type VoiceServerAction =
  | {
      readonly kind: 'metadata';
      readonly conversationId: string;
      readonly outputRate: number;
      readonly inputRate: number;
    }
  | { readonly kind: 'audio'; readonly base64: string }
  | { readonly kind: 'interruption' }
  | { readonly kind: 'ping'; readonly eventId: number }
  | { readonly kind: 'user-transcript'; readonly text: string }
  | { readonly kind: 'agent-response'; readonly text: string }
  | {
      readonly kind: 'tool-call';
      readonly name: string;
      readonly toolCallId: string;
      readonly question: string;
    };

export const DEFAULT_PCM_RATE = 16_000;

export function pcmRateFromFormat(format: unknown): number {
  const match =
    typeof format === 'string' ? /^pcm_(\d{4,5})$/.exec(format) : null;
  return match ? Number(match[1]) : DEFAULT_PCM_RATE;
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json =>
  value && typeof value === 'object' ? (value as Json) : {};

export function parseServerMessage(raw: string): VoiceServerAction | null {
  let message: Json;
  try {
    message = obj(JSON.parse(raw));
  } catch {
    return null;
  }
  switch (message.type) {
    case 'conversation_initiation_metadata': {
      const event = obj(message.conversation_initiation_metadata_event);
      return {
        kind: 'metadata',
        conversationId: String(event.conversation_id ?? ''),
        outputRate: pcmRateFromFormat(event.agent_output_audio_format),
        inputRate: pcmRateFromFormat(event.user_input_audio_format),
      };
    }
    case 'audio': {
      const base64 = obj(message.audio_event).audio_base_64;
      return typeof base64 === 'string' && base64
        ? { kind: 'audio', base64 }
        : null;
    }
    case 'interruption':
      return { kind: 'interruption' };
    case 'ping': {
      const eventId = obj(message.ping_event).event_id;
      return typeof eventId === 'number' ? { kind: 'ping', eventId } : null;
    }
    case 'user_transcript': {
      const text = obj(message.user_transcription_event).user_transcript;
      return typeof text === 'string'
        ? { kind: 'user-transcript', text }
        : null;
    }
    case 'agent_response': {
      const text = obj(message.agent_response_event).agent_response;
      return typeof text === 'string' ? { kind: 'agent-response', text } : null;
    }
    case 'client_tool_call': {
      const call = obj(message.client_tool_call);
      const params = obj(call.parameters);
      if (typeof call.tool_name !== 'string') return null;
      return {
        kind: 'tool-call',
        name: call.tool_name,
        toolCallId: String(call.tool_call_id ?? ''),
        question: typeof params.question === 'string' ? params.question : '',
      };
    }
    default:
      return null;
  }
}

export const encodeInit = () =>
  JSON.stringify({ type: 'conversation_initiation_client_data' });
export const encodePong = (eventId: number) =>
  JSON.stringify({ type: 'pong', event_id: eventId });
export const encodeAudioChunk = (base64: string) =>
  JSON.stringify({ user_audio_chunk: base64 });
export const encodeToolResult = (
  toolCallId: string,
  result: string,
  isError: boolean
) =>
  JSON.stringify({
    type: 'client_tool_result',
    tool_call_id: toolCallId,
    result,
    is_error: isError,
  });

export function float32ToPcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function pcm16Base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const length = Math.floor(binary.length / 2);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const lo = binary.charCodeAt(i * 2);
    const hi = binary.charCodeAt(i * 2 + 1);
    let value = (hi << 8) | lo;
    if (value >= 0x8000) value -= 0x10000;
    out[i] = value / 0x8000;
  }
  return out;
}

/**
 * Turn latency: the agent hearing the end of Tim's utterance (final user
 * transcript) to the first audio byte of the reply. Interruptions reset it so
 * a barge-in is never counted as a slow turn.
 */
export class VoiceLatencyTracker {
  private userFinalAt: number | null = null;
  private readonly samples: number[] = [];

  userFinal(at: number): void {
    this.userFinalAt = at;
  }
  interrupted(): void {
    this.userFinalAt = null;
  }
  firstAudio(at: number): number | null {
    if (this.userFinalAt === null) return null;
    const ms = Math.max(0, Math.round(at - this.userFinalAt));
    this.userFinalAt = null;
    this.samples.push(ms);
    return ms;
  }
  snapshot(): { count: number; p50: number | null; p95: number | null } {
    const sorted = [...this.samples].sort((a, b) => a - b);
    const q = (p: number) =>
      sorted.length
        ? (sorted[
            Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)
          ] ?? null)
        : null;
    return { count: sorted.length, p50: q(0.5), p95: q(0.95) };
  }
}

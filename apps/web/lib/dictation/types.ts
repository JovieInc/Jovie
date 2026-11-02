import type { TranscriberErrorCode } from '@/lib/chat/transcriber';

export type DictationErrorCode =
  | TranscriberErrorCode
  | 'quota'
  | 'rate_limited'
  | 'dictation_cap_reached'
  | 'token'
  | 'provider-down';
export type SttEvent =
  | { type: 'partial'; text: string }
  | { type: 'committed'; segmentId: string; text: string }
  | { type: 'error'; code: DictationErrorCode }
  | { type: 'closed' }
  | { type: 'speech' };
export interface SttStream {
  subscribe(listener: (event: SttEvent) => void): () => void;
  push(audio: Int16Array): void;
  commit(): void;
  close(): void;
  abort(): void;
}
export interface TtsStream {
  write(text: string): void;
  flush(): void;
  cancel(): void;
}
export interface DictationProvider {
  id: string;
  capabilities: {
    streaming: boolean;
    partials: boolean;
    batch: boolean;
    languages: readonly string[];
    maxSessionSec: number;
    fullDuplexSafe: boolean;
    runsIn: readonly ('web' | 'electron')[];
  };
  health(): boolean | Promise<boolean>;
  /** Web Speech owns its capture; other streaming providers receive the shared mic. */
  openStream?(
    mic: MediaStream | null,
    signal: AbortSignal
  ): SttStream | Promise<SttStream>;
  transcribe?(blob: Blob, signal: AbortSignal): Promise<string>;
}
export const DICTATION_MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

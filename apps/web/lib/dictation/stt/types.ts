/** Dictation speech-to-text adapter (JOV-9665). One interface, pluggable by config. */
export interface SttClip {
  readonly audio: Uint8Array;
  readonly mimeType: string;
  /** Recorded length; used for per-clip cost. Estimated from bytes if absent. */
  readonly durationMs: number;
}

export interface SttProvider {
  readonly id: string;
  /** USD per audio minute, for the call log and the spend cap. */
  readonly perMinuteUsd: number;
  /** False when credentials are not configured: skipped, not an error. */
  available(): boolean;
  transcribe(clip: SttClip, fetchImpl?: typeof fetch): Promise<string>;
}

export function clipCostUsd(provider: SttProvider, clip: SttClip): number {
  return (clip.durationMs / 60_000) * provider.perMinuteUsd;
}

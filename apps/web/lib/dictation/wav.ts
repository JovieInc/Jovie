import { DictationError } from './errors';
import { DICTATION_LIMITS } from './limits';
export const BATCH_MAX_BYTES = 4_000_000;
export const BATCH_CHUNK_SECONDS = 100;
export const PCM_SAMPLE_RATE = 16000;

/** Canonical mono PCM16 WAV; server measures duration from validated data bytes. */
export function encodeWav(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, PCM_SAMPLE_RATE, true);
  view.setUint32(28, PCM_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((value, index) => {
    const sample = Math.max(-1, Math.min(1, value));
    view.setInt16(
      44 + index * 2,
      Math.round(sample * (sample < 0 ? 32768 : 32767)),
      true
    );
  });
  return buffer;
}
export function measureWavSeconds(buffer: ArrayBuffer): number {
  if (buffer.byteLength < 46 || buffer.byteLength > BATCH_MAX_BYTES)
    throw new DictationError('dictation_cap_reached');
  const v = new DataView(buffer);
  const text = (offset: number, size: number) =>
    String.fromCharCode(...new Uint8Array(buffer, offset, size));
  if (
    text(0, 4) !== 'RIFF' ||
    text(8, 4) !== 'WAVE' ||
    text(12, 4) !== 'fmt ' ||
    text(36, 4) !== 'data' ||
    v.getUint32(4, true) !== buffer.byteLength - 8 ||
    v.getUint32(16, true) !== 16 ||
    v.getUint16(20, true) !== 1 ||
    v.getUint16(22, true) !== 1 ||
    v.getUint32(24, true) !== PCM_SAMPLE_RATE ||
    v.getUint32(28, true) !== PCM_SAMPLE_RATE * 2 ||
    v.getUint16(32, true) !== 2 ||
    v.getUint16(34, true) !== 16 ||
    v.getUint32(40, true) !== buffer.byteLength - 44 ||
    (buffer.byteLength - 44) % 2 !== 0
  )
    throw new DictationError('unknown');
  const seconds = (buffer.byteLength - 44) / (PCM_SAMPLE_RATE * 2);
  if (seconds < 0.1 || seconds > DICTATION_LIMITS.maxSessionSeconds)
    throw new DictationError('dictation_cap_reached');
  return Math.ceil(seconds);
}

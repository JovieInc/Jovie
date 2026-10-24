import { describe, expect, it } from 'vitest';
import { encodeWav, measureWavSeconds } from './wav';

describe('server-authoritative WAV audio seconds', () => {
  it('measures PCM data and rounds up fractional audio seconds', () => {
    expect(measureWavSeconds(encodeWav(new Float32Array(16001)))).toBe(2);
  });
  it('encodes signed PCM16 with clipping', () => {
    const v = new DataView(encodeWav(new Float32Array([-2, -1, 0, 1, 2])));
    expect([0, 1, 2, 3, 4].map(i => v.getInt16(44 + i * 2, true))).toEqual([
      -32768, -32768, 0, 32767, 32767,
    ]);
  });
  it.each([0, 4, 8, 12, 16, 20, 22, 24, 28, 32, 34, 36, 40])(
    'rejects forged WAV header byte %s',
    offset => {
      const buffer = encodeWav(new Float32Array(16000));
      const view = new DataView(buffer);
      view.setUint8(offset, view.getUint8(offset) ^ 1);
      expect(() => measureWavSeconds(buffer)).toThrow();
    }
  );
  it('rejects empty, too-short and oversized audio', () => {
    for (const buffer of [
      new ArrayBuffer(0),
      encodeWav(new Float32Array(1)),
      new ArrayBuffer(4000001),
    ])
      expect(() => measureWavSeconds(buffer)).toThrow();
  });
});

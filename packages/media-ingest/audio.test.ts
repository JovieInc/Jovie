import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeAudioFile, decodeWav, estimateBpm, estimateKey } from './audio';
import { buildWav, chord, clickTrack } from './test-helpers';

describe('decodeWav', () => {
  it('decodes 16-bit pcm mono', () => {
    const wav = buildWav(new Float32Array([0, 0.5, -0.5]));
    const decoded = decodeWav(wav);
    expect(decoded?.sampleRate).toBe(22050);
    expect(decoded?.samples.length).toBe(3);
    expect(decoded?.samples[1]).toBeCloseTo(0.5, 2);
  });

  it('rejects non-wav buffers', () => {
    expect(decodeWav(Buffer.from('nope'))).toBeNull();
  });
});

describe('estimateBpm', () => {
  it('recovers a click track tempo', () => {
    const rate = 22050;
    const samples = clickTrack(120, 6, rate);
    const bpm = estimateBpm(samples, rate);
    expect(bpm).not.toBeNull();
    expect(Math.abs((bpm ?? 0) - 120)).toBeLessThanOrEqual(3);
  });

  it('returns null on silence', () => {
    expect(estimateBpm(new Float32Array(44100), 22050)).toBeNull();
  });
});

describe('estimateKey', () => {
  it('identifies an A major triad', () => {
    const rate = 22050;
    // A3 220Hz, C#4 277.18Hz, E4 329.63Hz
    const samples = chord([220, 277.18, 329.63], 6, rate);
    const key = estimateKey(samples, rate);
    expect(key).toBe('A');
  });
});

describe('analyzeAudioFile', () => {
  it('reports wav analysis with duration', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mi-audio-'));
    const path = join(dir, 'voice memo.wav');
    await writeFile(path, buildWav(clickTrack(100, 4)));
    const result = await analyzeAudioFile(path);
    expect(result.codec).toBe('wav-pcm');
    expect(result.durationSec).toBeCloseTo(4, 0);
    expect(result.bpm).not.toBeNull();
    await rm(dir, { recursive: true });
  });

  it('marks other codecs unsupported rather than guessing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mi-audio-'));
    const path = join(dir, 'memo.m4a');
    await writeFile(path, Buffer.from('fakem4a'));
    const result = await analyzeAudioFile(path);
    expect(result.codec).toBe('unsupported');
    expect(result.bpm).toBeNull();
    await rm(dir, { recursive: true });
  });
});

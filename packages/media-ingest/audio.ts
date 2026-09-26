import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { AudioAnalysis } from './types';

interface WavData {
  samples: Float32Array;
  sampleRate: number;
  durationSec: number;
}

/** Decode a PCM (16-bit int or 32-bit float) WAV file to mono samples. */
export function decodeWav(buffer: Buffer): WavData | null {
  if (
    buffer.length < 44 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return null;
  }
  let offset = 12;
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataStart = -1;
  let dataLen = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = buffer.readUInt16LE(body);
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bits = buffer.readUInt16LE(body + 14);
    } else if (id === 'data') {
      dataStart = body;
      dataLen = size;
    }
    offset = body + size + (size % 2);
  }
  if (dataStart < 0 || channels === 0 || sampleRate === 0) return null;
  if (!((format === 1 && bits === 16) || (format === 3 && bits === 32))) {
    return null;
  }

  const frames = Math.floor(dataLen / (bits / 8) / channels);
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      const off = dataStart + (i * channels + ch) * (bits / 8);
      sum +=
        bits === 16 ? buffer.readInt16LE(off) / 32768 : buffer.readFloatLE(off);
    }
    samples[i] = sum / channels;
  }
  return { samples, sampleRate, durationSec: frames / sampleRate };
}

const MIN_BPM = 60;
const MAX_BPM = 200;

/**
 * Estimate tempo via onset-envelope autocorrelation. Returns null when the
 * signal has no detectable periodic onset structure.
 */
export function estimateBpm(
  samples: Float32Array,
  sampleRate: number
): number | null {
  const frameSize = 1024;
  const hop = 512;
  const frames = Math.floor((samples.length - frameSize) / hop);
  if (frames < 16) return null;

  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    const base = f * hop;
    for (let i = 0; i < frameSize; i += 4) {
      const s = samples[base + i];
      e += s * s;
    }
    energy[f] = e;
  }
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    onset[f] = Math.max(0, energy[f] - energy[f - 1]);
  }
  const mean = onset.reduce((a, b) => a + b, 0) / frames;
  if (mean <= 0) return null;

  const fps = sampleRate / hop;
  const minLag = Math.floor((fps * 60) / MAX_BPM);
  const maxLag = Math.min(Math.ceil((fps * 60) / MIN_BPM), frames - 1);
  // Normalized autocorrelation; the smallest lag near the max wins so
  // half-tempo harmonics do not drag the estimate down an octave.
  const scores = new Float64Array(maxLag + 1);
  let maxScore = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    for (let f = lag; f < frames; f++) score += onset[f] * onset[f - lag];
    scores[lag] = score / (frames - lag);
    if (scores[lag] > maxScore) maxScore = scores[lag];
  }
  if (maxScore <= 0) return null;
  let bestLag = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (scores[lag] === maxScore) {
      bestLag = lag;
      break;
    }
  }
  // Prefer submultiple periods when they still correlate — the raw peak is
  // often a half-tempo harmonic of the true pulse.
  while (bestLag > 0) {
    const half = Math.round(bestLag / 2);
    if (half < minLag || scores[half] < maxScore * 0.6) break;
    bestLag = half;
  }
  if (bestLag <= 0) return null;
  return Math.round(((fps * 60) / bestLag) * 10) / 10;
}

const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];
const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

function goertzelPower(
  samples: Float32Array,
  start: number,
  length: number,
  sampleRate: number,
  freq: number
): number {
  const k = (freq * length) / sampleRate;
  const w = (2 * Math.PI * k) / length;
  const coeff = 2 * Math.cos(w);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < length; i++) {
    s0 = samples[start + i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/**
 * Estimate musical key via a 12-bin chroma averaged over the clip, matched
 * against Krumhansl-Schmuckler major/minor profiles. Returns e.g. "Am".
 */
export function estimateKey(
  samples: Float32Array,
  sampleRate: number
): string | null {
  const window = 4096;
  const windows = Math.min(24, Math.floor(samples.length / window));
  if (windows < 2) return null;

  const chroma = new Float64Array(12);
  const midiMin = 36; // C2
  const midiMax = 96; // C7
  for (let w = 0; w < windows; w++) {
    const start = w * window;
    for (let midi = midiMin; midi <= midiMax; midi++) {
      const freq = 440 * 2 ** ((midi - 69) / 12);
      if (freq >= sampleRate / 2) break;
      chroma[midi % 12] += goertzelPower(
        samples,
        start,
        window,
        sampleRate,
        freq
      );
    }
  }
  const total = chroma.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  for (let i = 0; i < 12; i++) chroma[i] /= total;

  let best = { score: -1, name: '' };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [profile, suffix] of [
      [MAJOR_PROFILE, ''],
      [MINOR_PROFILE, 'm'],
    ] as const) {
      let score = 0;
      let normA = 0;
      let normB = 0;
      for (let i = 0; i < 12; i++) {
        const c = chroma[(i + tonic) % 12];
        score += c * profile[i];
        normA += c * c;
        normB += profile[i] * profile[i];
      }
      const corr = score / Math.sqrt(normA * normB);
      if (corr > best.score) {
        best = { score: corr, name: `${NOTE_NAMES[tonic]}${suffix}` };
      }
    }
  }
  return best.name || null;
}

/**
 * Analyze an audio or video file for duration, BPM and key. Only PCM WAV is
 * decoded locally; other codecs report 'unsupported' so the owner is asked
 * rather than the pipeline inventing values.
 */
export async function analyzeAudioFile(path: string): Promise<AudioAnalysis> {
  if (extname(path).toLowerCase() !== '.wav') {
    return { durationSec: null, bpm: null, key: null, codec: 'unsupported' };
  }
  const decoded = decodeWav(await readFile(path));
  if (!decoded) {
    return { durationSec: null, bpm: null, key: null, codec: 'unsupported' };
  }
  return {
    durationSec: Math.round(decoded.durationSec * 100) / 100,
    bpm: estimateBpm(decoded.samples, decoded.sampleRate),
    key: estimateKey(decoded.samples, decoded.sampleRate),
    codec: 'wav-pcm',
  };
}

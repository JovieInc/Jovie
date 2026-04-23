import { spawn } from 'node:child_process';

const DEFAULT_PEAK_COUNT = 500;

/**
 * Downsample a preview audio URL into an array of normalized peaks in [0, 1].
 *
 * Uses the `ffmpeg` binary (ships with Vercel runtime, Remotion also relies on it)
 * to decode to 16-bit mono PCM at 22.05 kHz, then streams samples and reduces to
 * `peakCount` RMS-ish peaks. Returns null if ffmpeg is unavailable or fails —
 * callers should degrade gracefully (skip waveform-dependent reel formats).
 */
export async function computeWaveform(
  url: string,
  peakCount: number = DEFAULT_PEAK_COUNT
): Promise<number[] | null> {
  if (!url) return null;

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    url,
    '-ac',
    '1',
    '-ar',
    '22050',
    '-f',
    's16le',
    '-',
  ];

  return new Promise(resolve => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      resolve(null);
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;

    proc.stdout?.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      totalBytes += chunk.length;
    });

    proc.once('error', () => resolve(null));
    proc.once('close', code => {
      if (code !== 0 || totalBytes === 0) {
        resolve(null);
        return;
      }
      const buf = Buffer.concat(chunks, totalBytes);
      const sampleCount = Math.floor(buf.length / 2);
      if (sampleCount === 0) {
        resolve(null);
        return;
      }
      const bucketSize = Math.max(1, Math.floor(sampleCount / peakCount));
      const peaks: number[] = new Array(peakCount).fill(0);
      for (let i = 0; i < peakCount; i++) {
        const start = i * bucketSize;
        const end = Math.min(start + bucketSize, sampleCount);
        let max = 0;
        for (let j = start; j < end; j++) {
          const sample = buf.readInt16LE(j * 2);
          const abs = Math.abs(sample);
          if (abs > max) max = abs;
        }
        peaks[i] = Math.min(1, max / 32768);
      }
      resolve(peaks);
    });
  });
}

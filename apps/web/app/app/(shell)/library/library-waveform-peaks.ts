const PEAK_COUNT = 96;

function hash1d(index: number): number {
  return Math.abs(Math.sin(index * 12.9898 + 78.233) * 43758.5453) % 1;
}

export function hashLibraryWaveformSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1_000_000;
  }
  return Math.max(1, hash);
}

export function libraryWaveformPeaks(seed: number): readonly number[] {
  return Array.from({ length: PEAK_COUNT }).map((_, index) => {
    const envelope =
      0.4 +
      0.32 * Math.abs(Math.sin((index + seed * 11) * 0.18)) +
      0.22 * Math.abs(Math.cos((index + seed * 7) * 0.31));
    const noise = hash1d(index + seed * 1000);
    return Math.max(0.08, Math.min(1, envelope * (0.55 + noise * 0.45)));
  });
}

export const LIBRARY_WAVEFORM_PEAK_COUNT = PEAK_COUNT;

const DEFAULT_PEAK_COUNT = 160;

function downsamplePeaks(samples: Float32Array, peakCount: number): number[] {
  if (samples.length === 0) {
    return Array.from({ length: peakCount }, () => 0.04);
  }

  const blockSize = Math.max(1, Math.floor(samples.length / peakCount));
  const peaks: number[] = [];

  for (let index = 0; index < peakCount; index += 1) {
    const start = index * blockSize;
    const end = Math.min(samples.length, start + blockSize);
    let peak = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const value = Math.abs(samples[sampleIndex] ?? 0);
      if (value > peak) peak = value;
    }

    peaks.push(Math.max(0.04, Math.min(1, peak)));
  }

  return peaks;
}

export async function decodeWaveformPeaks(
  audioUrl: string,
  peakCount = DEFAULT_PEAK_COUNT
): Promise<{ peaks: number[]; durationMs: number }> {
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error('Unable to load audio for waveform preview');
  }

  const buffer = await response.arrayBuffer();
  const audioContext = new AudioContext();

  try {
    const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    const peaks = downsamplePeaks(channel, peakCount);

    return {
      peaks,
      durationMs: Math.max(0, Math.round(audioBuffer.duration * 1000)),
    };
  } finally {
    await audioContext.close().catch(() => {});
  }
}

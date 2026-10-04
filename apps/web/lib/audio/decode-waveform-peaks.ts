const DEFAULT_PEAK_COUNT = 160;

/** Scoped preview recovery reason; raw transport errors stay in the cause. */
export type AudioPreviewFailureReason =
  | 'network'
  | 'permission'
  | 'removed'
  | 'unsupported'
  | 'unavailable';

export class AudioPreviewError extends Error {
  constructor(
    readonly reason: AudioPreviewFailureReason,
    readonly status?: number,
    options?: { cause?: unknown }
  ) {
    super('Audio preview unavailable', options);
    this.name = 'AudioPreviewError';
  }
}

function previewErrorForStatus(status: number): AudioPreviewError {
  if (status === 401 || status === 403) {
    return new AudioPreviewError('permission', status);
  }
  if (status === 404 || status === 410) {
    return new AudioPreviewError('removed', status);
  }
  return new AudioPreviewError('unavailable', status);
}

export function isAudioPreviewError(
  error: unknown
): error is AudioPreviewError {
  if (typeof error !== 'object' || error === null) return false;
  const { name, reason } = error as Partial<AudioPreviewError>;
  return name === 'AudioPreviewError' && typeof reason === 'string';
}

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
  let response: Response;
  try {
    response = await fetch(audioUrl);
  } catch (error) {
    throw new AudioPreviewError('network', undefined, { cause: error });
  }
  if (!response.ok) {
    throw previewErrorForStatus(response.status);
  }

  const buffer = await response.arrayBuffer().catch(error => {
    throw new AudioPreviewError('network', undefined, { cause: error });
  });
  const audioContext = new AudioContext();

  try {
    const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    const peaks = downsamplePeaks(channel, peakCount);

    return {
      peaks,
      durationMs: Math.max(0, Math.round(audioBuffer.duration * 1000)),
    };
  } catch (error) {
    throw new AudioPreviewError('unsupported', undefined, { cause: error });
  } finally {
    await audioContext.close().catch(() => {});
  }
}

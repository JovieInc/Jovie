import { Readable } from 'node:stream';

// Stryker disable next-line ArithmeticOperator: module initializer mutations
// run before the active mutant; boundary tests guard the exact 1 MiB contract.
const MAX_AIFF_HEADER_BYTES = 1024 * 1024;
export const MAX_AUDIO_DERIVATIVE_BYTES = 157_286_444;

export class AudioDerivativeConversionError extends Error {
  constructor(
    readonly code: 'invalid_source' | 'resource_limit',
    message: string
  ) {
    super(message);
    this.name = 'AudioDerivativeConversionError';
  }
}

interface AiffPcmMetadata {
  readonly bitsPerSample: number;
  readonly channels: number;
  readonly dataBytes: number;
  readonly dataOffset: number;
  readonly sampleRate: number;
}

function readExtended80(buffer: Buffer, offset: number): number {
  const exponentWord = buffer.readUInt16BE(offset);
  const sign = exponentWord & 0x8000 ? -1 : 1;
  const exponent = exponentWord & 0x7fff;
  const mantissa = buffer.readBigUInt64BE(offset + 2);

  const fraction = Number(mantissa) / 2 ** 63;
  return sign * fraction * 2 ** (exponent - 16_383);
}

function parseAiffPcmHeader(buffer: Buffer): AiffPcmMetadata | null {
  // Stryker disable next-line EqualityOperator: exactly 12 bytes contain only
  // FORM metadata; parsing now or after the next read has identical behavior.
  if (buffer.length < 12) return null;
  if (
    buffer.toString('ascii', 0, 4) !== 'FORM' ||
    buffer.toString('ascii', 8, 12) !== 'AIFF'
  ) {
    throw new AudioDerivativeConversionError(
      'invalid_source',
      'Expected an uncompressed AIFF container'
    );
  }

  let offset = 12;
  let format: Omit<AiffPcmMetadata, 'dataBytes' | 'dataOffset'> | null = null;

  // Stryker disable next-line EqualityOperator: an exact trailing chunk header
  // cannot be acted on until its body arrives, so either branch awaits a read.
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32BE(offset + 4);
    const chunkDataOffset = offset + 8;
    const paddedChunkEnd = chunkDataOffset + chunkSize + (chunkSize % 2);

    if (chunkId === 'COMM') {
      // Stryker disable next-line EqualityOperator: when exactly 18 bytes are
      // buffered both branches converge on awaiting the following SSND chunk.
      if (chunkSize < 18 || chunkDataOffset + 18 > buffer.length) return null;
      format = {
        channels: buffer.readUInt16BE(chunkDataOffset),
        bitsPerSample: buffer.readUInt16BE(chunkDataOffset + 6),
        sampleRate: readExtended80(buffer, chunkDataOffset + 8),
      };
    }

    if (chunkId === 'SSND') {
      if (chunkSize < 8 || chunkDataOffset + 8 > buffer.length) return null;
      if (!format) {
        throw new AudioDerivativeConversionError(
          'invalid_source',
          'AIFF sound data appeared before its format declaration'
        );
      }

      const soundOffset = buffer.readUInt32BE(chunkDataOffset);
      const dataOffset = chunkDataOffset + 8 + soundOffset;
      const dataBytes = chunkSize - 8 - soundOffset;
      if (dataOffset > buffer.length) return null;

      if (![8, 16, 24, 32].includes(format.bitsPerSample)) {
        throw new AudioDerivativeConversionError(
          'invalid_source',
          'AIFF PCM bit depth is unsupported'
        );
      }
      if (
        !Number.isInteger(format.channels) ||
        format.channels < 1 ||
        format.channels > 8
      ) {
        throw new AudioDerivativeConversionError(
          'invalid_source',
          'AIFF channel count is unsupported'
        );
      }
      if (
        !Number.isInteger(format.sampleRate) ||
        format.sampleRate < 8_000 ||
        format.sampleRate > 384_000
      ) {
        throw new AudioDerivativeConversionError(
          'invalid_source',
          'AIFF sample rate is unsupported'
        );
      }

      const bytesPerSample = format.bitsPerSample / 8;
      const blockAlign = format.channels * bytesPerSample;
      if (dataBytes <= 0) {
        throw new AudioDerivativeConversionError(
          'invalid_source',
          'AIFF sound data is empty'
        );
      }
      if (dataBytes % blockAlign !== 0) {
        throw new AudioDerivativeConversionError(
          'invalid_source',
          'AIFF sound data is not sample-aligned'
        );
      }
      if (dataBytes + 44 > MAX_AUDIO_DERIVATIVE_BYTES) {
        throw new AudioDerivativeConversionError(
          'resource_limit',
          'Playback derivative exceeds the output size limit'
        );
      }

      return {
        bitsPerSample: format.bitsPerSample,
        channels: format.channels,
        dataBytes,
        dataOffset,
        sampleRate: format.sampleRate,
      };
    }

    offset = paddedChunkEnd;
  }

  return null;
}

function createWavHeader(metadata: AiffPcmMetadata): Buffer {
  const bytesPerSample = metadata.bitsPerSample / 8;
  const blockAlign = metadata.channels * bytesPerSample;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(metadata.dataBytes + 36, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(metadata.channels, 22);
  header.writeUInt32LE(metadata.sampleRate, 24);
  header.writeUInt32LE(metadata.sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(metadata.bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(metadata.dataBytes, 40);
  return header;
}

function convertPcmByteOrder(chunk: Buffer, bytesPerSample: number): Buffer {
  const converted = Buffer.from(chunk);
  if (bytesPerSample === 1) {
    for (const index of converted.keys()) {
      converted[index] = (converted[index] ?? 0) ^ 0x80;
    }
    return converted;
  }

  for (let offset = 0; offset !== converted.length; offset += bytesPerSample) {
    converted.subarray(offset, offset + bytesPerSample).reverse();
  }
  return converted;
}

export interface PreparedAudioDerivative {
  readonly outputBytes: number;
  readonly stream: Readable;
}

export async function prepareAiffPlaybackDerivative(
  source: ReadableStream<Uint8Array>
): Promise<PreparedAudioDerivative> {
  const reader = source.getReader();
  const headerChunks: Buffer[] = [];
  let headerBytes = 0;
  let metadata: AiffPcmMetadata | null = null;

  while (!metadata) {
    const next = await reader.read();
    if (next.done) {
      throw new AudioDerivativeConversionError(
        'invalid_source',
        'AIFF ended before sound data was found'
      );
    }

    const chunk = Buffer.from(next.value);
    headerChunks.push(chunk);
    headerBytes += chunk.byteLength;
    if (headerBytes > MAX_AIFF_HEADER_BYTES) {
      await reader.cancel();
      throw new AudioDerivativeConversionError(
        'resource_limit',
        'AIFF header exceeds the scan limit'
      );
    }
    metadata = parseAiffPcmHeader(Buffer.concat(headerChunks, headerBytes));
  }

  const parsedMetadata = metadata;
  const buffered = Buffer.concat(headerChunks, headerBytes);
  const bytesPerSample = parsedMetadata.bitsPerSample / 8;
  const initialAudio = buffered.subarray(parsedMetadata.dataOffset);

  async function* wavChunks() {
    let remaining = parsedMetadata.dataBytes;
    let carry: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    try {
      yield createWavHeader(parsedMetadata);

      const emitPcm = function* (input: Buffer) {
        // Stryker disable next-line ConditionalExpression: concatenating an
        // empty carry is byte-equivalent but allocates on the hot path.
        const combined = carry.length ? Buffer.concat([carry, input]) : input;
        const available = Math.min(combined.length, remaining);
        const aligned = available - (available % bytesPerSample);
        // Stryker disable next-line ConditionalExpression,EqualityOperator:
        // aligned is non-negative; emitting an empty Buffer is discarded by
        // Node's Readable adapter and is observably byte-equivalent.
        if (aligned > 0) {
          const pcm = combined.subarray(0, aligned);
          remaining -= aligned;
          yield convertPcmByteOrder(pcm, bytesPerSample);
        }
        carry = combined.subarray(aligned, available);
      };

      yield* emitPcm(initialAudio);
      while (remaining > 0) {
        const next = await reader.read();
        if (next.done) break;
        yield* emitPcm(Buffer.from(next.value));
      }

      if (remaining !== 0) {
        throw new AudioDerivativeConversionError(
          'invalid_source',
          'AIFF sound data is truncated'
        );
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
  }

  return {
    outputBytes: parsedMetadata.dataBytes + 44,
    stream: Readable.from(wavChunks()),
  };
}

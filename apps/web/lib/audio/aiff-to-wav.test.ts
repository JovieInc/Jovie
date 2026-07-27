import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  MAX_AUDIO_DERIVATIVE_BYTES,
  prepareAiffPlaybackDerivative,
} from './aiff-to-wav';

function fixture(fileName: string): Buffer {
  return readFileSync(resolve(process.cwd(), 'tests/fixtures/audio', fileName));
}

function chunkedWebStream(
  bytes: Buffer,
  chunkSize: number
): ReadableStream<Uint8Array> {
  return Readable.toWeb(
    Readable.from(
      (function* chunks() {
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          yield bytes.subarray(offset, offset + chunkSize);
        }
      })()
    )
  ) as ReadableStream<Uint8Array>;
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function extended80(value: number): Buffer {
  const output = Buffer.alloc(10);
  if (Number.isNaN(value)) {
    output.writeUInt16BE(0x7fff, 0);
    return output;
  }
  if (value === 0) return output;

  const power = Math.floor(Math.log2(Math.abs(value)));
  const exponent = power + 16_383;
  const fraction = Math.abs(value) / 2 ** power;
  const mantissa = BigInt(Math.round(fraction * 2 ** 31)) << 32n;
  output.writeUInt16BE(exponent | (value < 0 ? 0x8000 : 0), 0);
  output.writeBigUInt64BE(mantissa, 2);
  return output;
}

function makeChunk(id: string, body: Buffer, declaredSize = body.length) {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32BE(declaredSize, 4);
  return Buffer.concat([
    header,
    body,
    ...(body.length % 2 === 1 ? [Buffer.alloc(1)] : []),
  ]);
}

function syntheticAiff(options?: {
  bitsPerSample?: number;
  channels?: number;
  commFirst?: boolean;
  declaredDataBytes?: number;
  includeOddJunk?: boolean;
  pcm?: Buffer;
  sampleRate?: number;
  soundOffset?: number;
}) {
  const bitsPerSample = options?.bitsPerSample ?? 16;
  const channels = options?.channels ?? 1;
  const pcm = options?.pcm ?? Buffer.from([0x12, 0x34, 0xfe, 0xdc]);
  const soundOffset = options?.soundOffset ?? 0;
  const declaredDataBytes = options?.declaredDataBytes ?? pcm.length;

  const commBody = Buffer.alloc(18);
  commBody.writeUInt16BE(channels, 0);
  const bytesPerFrame = Math.max(1, channels * (bitsPerSample / 8));
  commBody.writeUInt32BE(
    Math.max(0, Math.floor(declaredDataBytes / bytesPerFrame)),
    2
  );
  commBody.writeUInt16BE(bitsPerSample, 6);
  extended80(options?.sampleRate ?? 44_100).copy(commBody, 8);
  const comm = makeChunk('COMM', commBody);

  const soundBody = Buffer.concat([
    Buffer.alloc(8),
    Buffer.alloc(soundOffset),
    pcm,
  ]);
  soundBody.writeUInt32BE(soundOffset, 0);
  const sound = makeChunk(
    'SSND',
    soundBody,
    8 + soundOffset + declaredDataBytes
  );
  const chunks = options?.commFirst === false ? [sound, comm] : [comm, sound];
  if (options?.includeOddJunk) {
    chunks.unshift(makeChunk('JUNK', Buffer.from([0x7f])));
  }

  const formBody = Buffer.concat([Buffer.from('AIFF', 'ascii'), ...chunks]);
  const formHeader = Buffer.alloc(8);
  formHeader.write('FORM', 0, 'ascii');
  formHeader.writeUInt32BE(formBody.length, 4);
  return Buffer.concat([formHeader, formBody]);
}

async function convert(bytes: Buffer, chunkSize = 7): Promise<Buffer> {
  const prepared = await prepareAiffPlaybackDerivative(
    chunkedWebStream(bytes, chunkSize)
  );
  return collect(prepared.stream);
}

describe('AIFF playback derivative conversion', () => {
  it('streams a real AIFF into a bounded canonical PCM WAV', async () => {
    const source = fixture('tone.aiff');
    const prepared = await prepareAiffPlaybackDerivative(
      chunkedWebStream(source, 7)
    );
    const output = await collect(prepared.stream);

    expect(output.byteLength).toBe(prepared.outputBytes);
    expect(output).toEqual(fixture('tone.wav'));
    expect(output.toString('ascii', 0, 4)).toBe('RIFF');
    expect(output.toString('ascii', 8, 12)).toBe('WAVE');
    expect(output.toString('ascii', 36, 40)).toBe('data');
    expect(output.readUInt16LE(20)).toBe(1);
    expect(output.readUInt16LE(22)).toBe(1);
    expect(output.readUInt32LE(24)).toBe(44_100);
    expect(output.readUInt16LE(34)).toBe(16);
    expect(output.readUInt32LE(40)).toBe(88_200);
  }, 15_000);

  it('fails closed for a truncated AIFF before emitting a derivative', async () => {
    await expect(
      prepareAiffPlaybackDerivative(
        chunkedWebStream(fixture('truncated.aiff'), 13)
      )
    ).rejects.toMatchObject({
      name: 'AudioDerivativeConversionError',
      code: 'invalid_source',
      message: 'AIFF ended before sound data was found',
    });
  });

  it.each([
    ['FORM', 0],
    ['AIFF', 8],
  ])('rejects an invalid %s container signature', async (_, offset) => {
    const source = Buffer.from(fixture('tone.aiff'));
    source.write('NOPE', offset, 'ascii');

    await expect(
      prepareAiffPlaybackDerivative(chunkedWebStream(source, 13))
    ).rejects.toMatchObject({
      name: 'AudioDerivativeConversionError',
      code: 'invalid_source',
      message: 'Expected an uncompressed AIFF container',
    });
  });

  it('rejects inconsistent declared sound data during stream consumption', async () => {
    const source = fixture('tone.aiff');
    const truncated = source.subarray(0, source.length - 17);
    const prepared = await prepareAiffPlaybackDerivative(
      chunkedWebStream(truncated, 31)
    );

    await expect(collect(prepared.stream)).rejects.toMatchObject({
      name: 'AudioDerivativeConversionError',
      code: 'invalid_source',
      message: 'AIFF sound data is truncated',
    });
  });

  it.each([
    [8, Buffer.from([0x80, 0x00, 0x7f]), Buffer.from([0x00, 0x80, 0xff])],
    [
      16,
      Buffer.from([0x12, 0x34, 0xfe, 0xdc]),
      Buffer.from([0x34, 0x12, 0xdc, 0xfe]),
    ],
    [
      24,
      Buffer.from([0x12, 0x34, 0x56, 0xfe, 0xdc, 0xba]),
      Buffer.from([0x56, 0x34, 0x12, 0xba, 0xdc, 0xfe]),
    ],
    [
      32,
      Buffer.from([0x12, 0x34, 0x56, 0x78, 0xfe, 0xdc, 0xba, 0x98]),
      Buffer.from([0x78, 0x56, 0x34, 0x12, 0x98, 0xba, 0xdc, 0xfe]),
    ],
  ] as const)('converts %i-bit PCM samples exactly across stream boundaries', async (bitsPerSample, pcm, expectedPcm) => {
    const output = await convert(
      syntheticAiff({ bitsPerSample, pcm }),
      bitsPerSample === 24 ? 5 : 3
    );
    const bytesPerSample = bitsPerSample / 8;

    expect(output.readUInt16LE(22)).toBe(1);
    expect(output.readUInt32LE(24)).toBe(44_100);
    expect(output.readUInt32LE(28)).toBe(44_100 * bytesPerSample);
    expect(output.readUInt16LE(32)).toBe(bytesPerSample);
    expect(output.readUInt16LE(34)).toBe(bitsPerSample);
    expect(output.readUInt32LE(40)).toBe(expectedPcm.length);
    expect(output.subarray(44)).toEqual(expectedPcm);
  });

  it.each([
    8_000, 384_000,
  ])('preserves the supported %i Hz sample-rate boundary', async sampleRate => {
    const output = await convert(syntheticAiff({ sampleRate }));
    expect(output.readUInt32LE(24)).toBe(sampleRate);
    expect(output.readUInt32LE(28)).toBe(sampleRate * 2);
  });

  it('preserves stereo block alignment and skips padded odd chunks', async () => {
    const output = await convert(
      syntheticAiff({
        channels: 2,
        includeOddJunk: true,
        pcm: Buffer.from([0x12, 0x34, 0x56, 0x78]),
      })
    );
    expect(output.readUInt16LE(22)).toBe(2);
    expect(output.readUInt16LE(32)).toBe(4);
    expect(output.subarray(44)).toEqual(Buffer.from([0x34, 0x12, 0x78, 0x56]));
  });

  it('accepts the eight-channel boundary with aligned PCM', async () => {
    const output = await convert(
      syntheticAiff({ channels: 8, pcm: Buffer.alloc(16) })
    );
    expect(output.readUInt16LE(22)).toBe(8);
    expect(output.readUInt16LE(32)).toBe(16);
  });

  it('skips a positive SSND offset before converting PCM', async () => {
    const output = await convert(
      syntheticAiff({
        soundOffset: 4,
        pcm: Buffer.from([0x12, 0x34, 0xfe, 0xdc]),
      })
    );
    expect(output.subarray(44)).toEqual(Buffer.from([0x34, 0x12, 0xdc, 0xfe]));
  });

  it.each([
    [
      'unsupported bit depth',
      { bitsPerSample: 12 },
      'AIFF PCM bit depth is unsupported',
    ],
    ['zero channels', { channels: 0 }, 'AIFF channel count is unsupported'],
    ['too many channels', { channels: 9 }, 'AIFF channel count is unsupported'],
    [
      'sample rate below range',
      { sampleRate: 7_999 },
      'AIFF sample rate is unsupported',
    ],
    [
      'sample rate above range',
      { sampleRate: 384_001 },
      'AIFF sample rate is unsupported',
    ],
    [
      'fractional sample rate',
      { sampleRate: 44_100.5 },
      'AIFF sample rate is unsupported',
    ],
    [
      'negative sample rate',
      { sampleRate: -44_100 },
      'AIFF sample rate is unsupported',
    ],
    ['zero sample rate', { sampleRate: 0 }, 'AIFF sample rate is unsupported'],
    [
      'non-finite sample rate',
      { sampleRate: Number.NaN },
      'AIFF sample rate is unsupported',
    ],
    ['empty sound data', { pcm: Buffer.alloc(0) }, 'AIFF sound data is empty'],
    [
      'misaligned sound data',
      { channels: 2, pcm: Buffer.from([0x12, 0x34]) },
      'AIFF sound data is not sample-aligned',
    ],
    [
      'sound offset beyond chunk',
      { soundOffset: 8, declaredDataBytes: -4 },
      'AIFF sound data is empty',
    ],
  ] as const)('rejects %s', async (_, options, message) => {
    await expect(
      convert(syntheticAiff(options as Parameters<typeof syntheticAiff>[0]))
    ).rejects.toMatchObject({
      name: 'AudioDerivativeConversionError',
      code: 'invalid_source',
      message,
    });
  });

  it('rejects sound data before the format declaration', async () => {
    await expect(
      convert(syntheticAiff({ commFirst: false }))
    ).rejects.toMatchObject({
      name: 'AudioDerivativeConversionError',
      code: 'invalid_source',
      message: 'AIFF sound data appeared before its format declaration',
    });
  });

  it.each([
    ['COMM', 16, 17],
    ['SSND', 42, 7],
  ])('rejects a %s chunk whose declared body is shorter than its fixed fields', async (_, sizeOffset, declaredSize) => {
    const source = syntheticAiff();
    source.writeUInt32BE(declaredSize, sizeOffset);

    await expect(convert(source, source.length)).rejects.toMatchObject({
      name: 'AudioDerivativeConversionError',
      code: 'invalid_source',
      message: 'AIFF ended before sound data was found',
    });
  });

  it('enforces the derivative output limit from header metadata', async () => {
    await expect(
      convert(
        syntheticAiff({
          declaredDataBytes: MAX_AUDIO_DERIVATIVE_BYTES,
          pcm: Buffer.alloc(0),
        })
      )
    ).rejects.toMatchObject({
      name: 'AudioDerivativeConversionError',
      code: 'resource_limit',
      message: 'Playback derivative exceeds the output size limit',
    });
  });

  it('allows an output exactly at the derivative size limit', async () => {
    const prepared = await prepareAiffPlaybackDerivative(
      chunkedWebStream(
        syntheticAiff({
          declaredDataBytes: MAX_AUDIO_DERIVATIVE_BYTES - 44,
          pcm: Buffer.alloc(0),
        }),
        64
      )
    );
    expect(prepared.outputBytes).toBe(MAX_AUDIO_DERIVATIVE_BYTES);
    prepared.stream.destroy();
  });

  it('enforces the bounded header scan before buffering an unbounded chunk', async () => {
    const junk = makeChunk('JUNK', Buffer.alloc(1024 * 1024));
    const formBody = Buffer.concat([Buffer.from('AIFF', 'ascii'), junk]);
    const header = Buffer.alloc(8);
    header.write('FORM', 0, 'ascii');
    header.writeUInt32BE(formBody.length, 4);

    await expect(
      prepareAiffPlaybackDerivative(
        chunkedWebStream(Buffer.concat([header, formBody]), formBody.length + 8)
      )
    ).rejects.toMatchObject({
      name: 'AudioDerivativeConversionError',
      code: 'resource_limit',
      message: 'AIFF header exceeds the scan limit',
    });
  });

  it('allows exactly one MiB of header data before failing as incomplete', async () => {
    const junk = makeChunk('JUNK', Buffer.alloc(1024 * 1024 - 20));
    const formBody = Buffer.concat([Buffer.from('AIFF', 'ascii'), junk]);
    const header = Buffer.alloc(8);
    header.write('FORM', 0, 'ascii');
    header.writeUInt32BE(formBody.length, 4);
    const source = Buffer.concat([header, formBody]);
    expect(source.length).toBe(1024 * 1024);

    await expect(
      prepareAiffPlaybackDerivative(chunkedWebStream(source, source.length))
    ).rejects.toMatchObject({
      code: 'invalid_source',
      message: 'AIFF ended before sound data was found',
    });
  });

  it('cancels the source reader after the declared PCM is complete', async () => {
    let cancelled = false;
    const bytes = syntheticAiff();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
      },
      cancel() {
        cancelled = true;
      },
    });
    const prepared = await prepareAiffPlaybackDerivative(source);
    await collect(prepared.stream);
    expect(cancelled).toBe(true);
  });
});

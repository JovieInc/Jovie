import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  delMock: vi.fn(),
  getMock: vi.fn(),
  infoMock: vi.fn(),
  putMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  del: hoisted.delMock,
  get: hoisted.getMock,
  put: hoisted.putMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: hoisted.infoMock,
    warn: hoisted.warnMock,
  },
}));

import {
  AudioDerivativeConversionError,
  MAX_AUDIO_DERIVATIVE_BYTES,
} from '../aiff-to-wav';
import { processAudioPlaybackDerivativeJob } from './playback-derivative';

const RECORDING_ID = '00000000-0000-4000-8000-000000000001';
const PROFILE_ID = '00000000-0000-4000-8000-000000000002';
const JOB_ID = '00000000-0000-4000-8000-000000000003';

function pendingMetadata() {
  return {
    audioPlaybackDerivative: {
      status: 'pending',
      generation: 1,
      sourceFormatId: 'aiff',
      requestedAt: '2026-07-26T00:00:00.000Z',
    },
  };
}

function fakeTransaction(
  recording: {
    audioFormat: string | null;
    audioUrl: string | null;
    metadata: Record<string, unknown>;
  },
  updatedRows: readonly { id: string }[] = [{ id: RECORDING_ID }]
) {
  const setMock = vi.fn();
  const returningMock = vi.fn().mockResolvedValue(updatedRows);
  const whereUpdateMock = vi.fn().mockReturnValue({
    returning: returningMock,
  });
  const updateMock = vi.fn().mockReturnValue({
    set: (...args: unknown[]) => {
      setMock(...args);
      return { where: whereUpdateMock };
    },
  });
  const limitMock = vi.fn().mockResolvedValue([recording]);
  const selectMock = vi.fn().mockReturnValue({
    from: () => ({
      where: () => ({ limit: limitMock }),
    }),
  });

  return {
    tx: { select: selectMock, update: updateMock },
    setMock,
  };
}

function job(attempts = 1, maxAttempts = 3) {
  return {
    id: JOB_ID,
    jobType: 'audio_playback_derivative',
    payload: {
      recordingId: RECORDING_ID,
      creatorProfileId: PROFILE_ID,
      formatId: 'aiff',
      generation: 1,
    },
    status: 'processing',
    error: null,
    attempts,
    runAt: new Date('2026-07-26T00:00:00.000Z'),
    priority: -10,
    maxAttempts,
    nextRunAt: null,
    dedupKey: `audio_playback_derivative:${RECORDING_ID}:1`,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as const;
}

function mockRealAiffSource() {
  const bytes = readFileSync(
    resolve(process.cwd(), 'tests/fixtures/audio/tone.aiff')
  );
  hoisted.getMock.mockResolvedValue({
    statusCode: 200,
    stream: Readable.toWeb(Readable.from([bytes])),
    blob: { size: bytes.byteLength },
  });
  return bytes;
}

function writtenState(setMock: ReturnType<typeof vi.fn>): string {
  const metadata = setMock.mock.calls.at(-1)?.[0]?.metadata as
    | { queryChunks?: unknown[] }
    | undefined;
  return (metadata?.queryChunks ?? [])
    .flatMap(chunk => {
      if (typeof chunk === 'string') return [chunk];
      if (
        chunk &&
        typeof chunk === 'object' &&
        'value' in chunk &&
        Array.isArray(chunk.value)
      ) {
        return chunk.value.filter(value => typeof value === 'string');
      }
      return [];
    })
    .join('');
}

describe('audio playback derivative job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.delMock.mockResolvedValue(undefined);
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  });

  it('streams a real AIFF to storage and publishes only the ready derivative', async () => {
    const bytes = mockRealAiffSource();
    hoisted.putMock.mockImplementation(async (_path, stream: Readable) => {
      let outputBytes = 0;
      for await (const chunk of stream) outputBytes += chunk.byteLength;
      expect(outputBytes).toBe(88_244);
      return { url: 'https://blob.example/preview.wav' };
    });
    const { tx, setMock } = fakeTransaction({
      audioFormat: 'audio/aiff',
      audioUrl: 'https://blob.example/master.aiff',
      metadata: pendingMetadata(),
    });

    await processAudioPlaybackDerivativeJob(tx as never, job() as never);

    expect(hoisted.putMock).toHaveBeenCalledWith(
      `audio-derivatives/${RECORDING_ID}/playback-1.wav`,
      expect.any(Readable),
      {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 31_536_000,
        contentType: 'audio/wav',
        maximumSizeInBytes: MAX_AUDIO_DERIVATIVE_BYTES,
        multipart: true,
        token: 'test-token',
        abortSignal: expect.any(AbortSignal),
      }
    );
    expect(hoisted.getMock).toHaveBeenCalledWith(
      'https://blob.example/master.aiff',
      {
        access: 'public',
        token: 'test-token',
        abortSignal: expect.any(AbortSignal),
      }
    );
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        previewUrl: 'https://blob.example/preview.wav',
      })
    );
    expect(writtenState(setMock)).toContain('"status":"ready"');
    expect(writtenState(setMock)).toContain('"mimeType":"audio/wav"');
    expect(writtenState(setMock)).toContain('"outputBytes":88244');
    expect(hoisted.infoMock).toHaveBeenCalledWith(
      'Audio playback derivative completed',
      expect.objectContaining({
        inputBytes: bytes.byteLength,
        outputBytes: 88_244,
        formatId: 'aiff',
      })
    );
    expect(
      hoisted.infoMock.mock.calls[0]?.[1]?.conversionDurationMs
    ).toBeLessThan(10_000);
  });

  it('deletes its uploaded derivative when the generation loses the commit race', async () => {
    mockRealAiffSource();
    hoisted.putMock.mockImplementation(async (_path, stream: Readable) => {
      for await (const _chunk of stream) {
        // Consume the real conversion stream before simulating the lost race.
      }
      return { url: 'https://blob.example/stale-preview.wav' };
    });
    const { tx } = fakeTransaction(
      {
        audioFormat: 'audio/aiff',
        audioUrl: 'https://blob.example/master.aiff',
        metadata: pendingMetadata(),
      },
      []
    );

    await processAudioPlaybackDerivativeJob(tx as never, job() as never);

    expect(hoisted.delMock).toHaveBeenCalledWith(
      'https://blob.example/stale-preview.wav',
      { token: 'test-token' }
    );
    expect(hoisted.infoMock).not.toHaveBeenCalled();
  });

  it('resumes a retrying derivative generation', async () => {
    mockRealAiffSource();
    hoisted.putMock.mockImplementation(async (_path, stream: Readable) => {
      for await (const _chunk of stream) {
        // Consume the real derivative before publishing it.
      }
      return { url: 'https://blob.example/retried-preview.wav' };
    });
    const { tx } = fakeTransaction({
      audioFormat: 'audio/aiff',
      audioUrl: 'https://blob.example/master.aiff',
      metadata: {
        audioPlaybackDerivative: {
          status: 'retrying',
          generation: 1,
          sourceFormatId: 'aiff',
          attempt: 1,
          maxAttempts: 3,
          retryAt: '2026-07-26T00:01:00.000Z',
        },
      },
    });

    await processAudioPlaybackDerivativeJob(tx as never, job(2) as never);

    expect(hoisted.putMock).toHaveBeenCalledOnce();
    expect(hoisted.infoMock).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'a superseded generation',
      {
        status: 'superseded',
        generation: 1,
        sourceFormatId: 'aiff',
        supersededAt: '2026-07-26T00:01:00.000Z',
      },
    ],
    [
      'a different generation',
      {
        status: 'pending',
        generation: 2,
        sourceFormatId: 'aiff',
        requestedAt: '2026-07-26T00:01:00.000Z',
      },
    ],
    [
      'a different source format',
      {
        status: 'pending',
        generation: 1,
        sourceFormatId: 'wav',
        requestedAt: '2026-07-26T00:01:00.000Z',
      },
    ],
    [
      'an already ready derivative',
      {
        status: 'ready',
        generation: 1,
        sourceFormatId: 'aiff',
        readyAt: '2026-07-26T00:01:00.000Z',
        url: 'https://blob.example/ready.wav',
        mimeType: 'audio/wav',
        outputBytes: 44,
      },
    ],
  ])('does not process %s', async (_, derivative) => {
    const { tx } = fakeTransaction({
      audioFormat: 'audio/mpeg',
      audioUrl: 'https://blob.example/new-master.mp3',
      metadata: {
        audioPlaybackDerivative: derivative,
      },
    });

    await processAudioPlaybackDerivativeJob(tx as never, job() as never);

    expect(hoisted.getMock).not.toHaveBeenCalled();
    expect(hoisted.putMock).not.toHaveBeenCalled();
  });

  it('does not process a missing or untyped derivative record', async () => {
    const { tx } = fakeTransaction(undefined as never);

    await processAudioPlaybackDerivativeJob(tx as never, job(3) as never);

    expect(hoisted.getMock).not.toHaveBeenCalled();
    expect(hoisted.putMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a missing master URL',
      {
        audioFormat: 'audio/aiff',
        audioUrl: null,
        metadata: pendingMetadata(),
      },
    ],
    [
      'a changed source format',
      {
        audioFormat: 'audio/mpeg',
        audioUrl: 'https://blob.example/master.mp3',
        metadata: pendingMetadata(),
      },
    ],
  ])('fails closed for %s', async (_, recording) => {
    const { tx, setMock } = fakeTransaction(recording as never);

    await expect(
      processAudioPlaybackDerivativeJob(tx as never, job(3) as never)
    ).rejects.toMatchObject({
      name: 'AudioDerivativeJobError',
      reason: 'invalid_source',
      message: 'Audio derivative source is missing or changed',
    });

    expect(writtenState(setMock)).toContain('"status":"failed"');
    expect(writtenState(setMock)).toContain('"reason":"invalid_source"');
    expect(hoisted.getMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a missing storage token',
      () => {
        delete process.env.BLOB_READ_WRITE_TOKEN;
      },
      'Audio derivative storage is not configured',
      'storage_failed',
    ],
    [
      'a missing blob response',
      () => {
        hoisted.getMock.mockResolvedValue(null);
      },
      'Audio derivative source could not be read',
      'storage_failed',
    ],
    [
      'a non-success blob response',
      () => {
        hoisted.getMock.mockResolvedValue({
          statusCode: 404,
          stream: new ReadableStream(),
          blob: { size: 0 },
        });
      },
      'Audio derivative source could not be read',
      'storage_failed',
    ],
    [
      'an oversized master',
      () => {
        hoisted.getMock.mockResolvedValue({
          statusCode: 200,
          stream: new ReadableStream(),
          blob: { size: MAX_AUDIO_DERIVATIVE_BYTES + 1 },
        });
      },
      'Audio derivative source exceeds the processing limit',
      'resource_limit',
    ],
  ])('classifies %s without exposing storage input', async (_, setup, message, reason) => {
    setup();
    const { tx, setMock } = fakeTransaction({
      audioFormat: 'audio/aiff',
      audioUrl: 'https://blob.example/master.aiff',
      metadata: pendingMetadata(),
    });

    await expect(
      processAudioPlaybackDerivativeJob(tx as never, job(3) as never)
    ).rejects.toMatchObject({
      name: 'AudioDerivativeJobError',
      message,
      reason,
    });

    expect(writtenState(setMock)).toContain('"status":"failed"');
    expect(writtenState(setMock)).toContain(`"reason":"${reason}"`);
    expect(hoisted.putMock).not.toHaveBeenCalled();
    expect(hoisted.delMock).not.toHaveBeenCalled();
  });

  it('preserves conversion and timeout classifications through storage wrappers', async () => {
    const invalidAiff = Buffer.from('not an aiff');
    hoisted.getMock.mockResolvedValueOnce({
      statusCode: 200,
      stream: Readable.toWeb(Readable.from([invalidAiff])),
      blob: { size: invalidAiff.byteLength },
    });
    const first = fakeTransaction({
      audioFormat: 'audio/aiff',
      audioUrl: 'https://blob.example/master.aiff',
      metadata: pendingMetadata(),
    });
    await expect(
      processAudioPlaybackDerivativeJob(first.tx as never, job(3) as never)
    ).rejects.toMatchObject({
      reason: 'invalid_source',
    });
    expect(writtenState(first.setMock)).toContain('"reason":"invalid_source"');

    const abortError = new Error('private abort detail');
    abortError.name = 'AbortError';
    hoisted.getMock.mockRejectedValueOnce(abortError);
    const second = fakeTransaction({
      audioFormat: 'audio/aiff',
      audioUrl: 'https://blob.example/master.aiff',
      metadata: pendingMetadata(),
    });
    await expect(
      processAudioPlaybackDerivativeJob(second.tx as never, job(3) as never)
    ).rejects.toMatchObject({
      reason: 'resource_limit',
      message: 'Audio derivative processing timed out',
    });
    expect(writtenState(second.setMock)).toContain('"reason":"resource_limit"');

    hoisted.getMock.mockRejectedValueOnce(
      new AudioDerivativeConversionError(
        'invalid_source',
        'Typed conversion failure'
      )
    );
    const third = fakeTransaction({
      audioFormat: 'audio/aiff',
      audioUrl: 'https://blob.example/master.aiff',
      metadata: pendingMetadata(),
    });
    await expect(
      processAudioPlaybackDerivativeJob(third.tx as never, job(3) as never)
    ).rejects.toMatchObject({
      reason: 'invalid_source',
      message: 'Typed conversion failure',
    });
  });

  it('allows a source exactly at the processing-size boundary', async () => {
    hoisted.getMock.mockResolvedValue({
      statusCode: 200,
      stream: null,
      blob: { size: MAX_AUDIO_DERIVATIVE_BYTES },
    });
    const { tx, setMock } = fakeTransaction({
      audioFormat: 'audio/aiff',
      audioUrl: 'https://blob.example/master.aiff',
      metadata: pendingMetadata(),
    });

    await expect(
      processAudioPlaybackDerivativeJob(tx as never, job(3) as never)
    ).rejects.toMatchObject({ reason: 'conversion_failed' });
    expect(writtenState(setMock)).toContain('"reason":"conversion_failed"');
  });

  it('classifies an unexpected conversion exception without logging its value', async () => {
    hoisted.getMock.mockResolvedValue({
      statusCode: 200,
      stream: null,
      blob: { size: 10 },
    });
    const { tx, setMock } = fakeTransaction({
      audioFormat: 'audio/aiff',
      audioUrl: 'https://blob.example/master.aiff',
      metadata: pendingMetadata(),
    });

    await expect(
      processAudioPlaybackDerivativeJob(tx as never, job(3) as never)
    ).rejects.toMatchObject({
      reason: 'conversion_failed',
      message: 'Audio derivative processing failed',
    });
    expect(writtenState(setMock)).toContain('"reason":"conversion_failed"');
    expect(JSON.stringify(hoisted.warnMock.mock.calls)).not.toContain(
      'getReader'
    );
  });

  it('redacts storage failures and transitions to retrying', async () => {
    hoisted.getMock.mockRejectedValue(
      new Error('https://private.example/master.aiff?secret=value')
    );
    const { tx, setMock } = fakeTransaction({
      audioFormat: 'audio/aiff',
      audioUrl: 'https://blob.example/master.aiff',
      metadata: pendingMetadata(),
    });

    await expect(
      processAudioPlaybackDerivativeJob(tx as never, job() as never)
    ).rejects.toThrow('Audio derivative source could not be read');

    const logged = JSON.stringify(hoisted.warnMock.mock.calls);
    expect(logged).not.toContain('private.example');
    expect(logged).not.toContain('secret=value');
    expect(setMock).toHaveBeenCalled();
    expect(writtenState(setMock)).toContain('"status":"retrying"');
    expect(writtenState(setMock)).toContain('"attempt":1');
    expect(writtenState(setMock)).toContain('"maxAttempts":3');
    expect(hoisted.warnMock).toHaveBeenCalledWith(
      'Audio playback derivative failed',
      expect.objectContaining({
        failureReason: 'storage_failed',
        attempt: 1,
        maxAttempts: 3,
      })
    );
    expect(
      hoisted.warnMock.mock.calls[0]?.[1]?.conversionDurationMs
    ).toBeLessThan(10_000);
  });

  it('moves the last failed attempt to a terminal failed state', async () => {
    hoisted.getMock.mockRejectedValue(new Error('private storage detail'));
    const { tx, setMock } = fakeTransaction({
      audioFormat: 'audio/aiff',
      audioUrl: 'https://blob.example/master.aiff',
      metadata: pendingMetadata(),
    });

    await expect(
      processAudioPlaybackDerivativeJob(tx as never, job(3, 3) as never)
    ).rejects.toMatchObject({ reason: 'storage_failed' });

    expect(writtenState(setMock)).toContain('"status":"failed"');
    expect(writtenState(setMock)).toContain('"reason":"storage_failed"');
  });

  it('redacts upload failures and classifies them as storage failures', async () => {
    mockRealAiffSource();
    hoisted.putMock.mockImplementation(async (_path, stream: Readable) => {
      for await (const _chunk of stream) {
        // Consume the derivative so conversion is proven before storage fails.
      }
      throw new Error('https://private.example/preview.wav?secret=value');
    });
    const { tx } = fakeTransaction({
      audioFormat: 'audio/aiff',
      audioUrl: 'https://blob.example/master.aiff',
      metadata: pendingMetadata(),
    });

    await expect(
      processAudioPlaybackDerivativeJob(tx as never, job() as never)
    ).rejects.toThrow('Audio derivative could not be stored');

    const logged = JSON.stringify(hoisted.warnMock.mock.calls);
    expect(logged).not.toContain('private.example');
    expect(logged).not.toContain('secret=value');
    expect(hoisted.warnMock).toHaveBeenCalledWith(
      'Audio playback derivative failed',
      expect.objectContaining({ failureReason: 'storage_failed' })
    );
  });
});

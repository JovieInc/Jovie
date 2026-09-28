import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { head } from '@vercel/blob';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MALFORMED_AUDIO_FIXTURES,
  REAL_AUDIO_FIXTURES,
} from '@/tests/fixtures/audio/manifest';
import {
  AudioBlobVerificationError,
  sniffAudioBytes,
  verifyAudioBlob,
} from './blob-verifier';

vi.mock('@vercel/blob', () => ({
  head: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('audio blob byte verifier', () => {
  it.each(REAL_AUDIO_FIXTURES)(
    'accepts the real $formatId fixture',
    async fixture => {
      const bytes = new Uint8Array(
        await readFile(
          join(process.cwd(), 'tests/fixtures/audio', fixture.fileName)
        )
      );
      expect(sniffAudioBytes(bytes, bytes.length)).toBe(fixture.formatId);
    }
  );

  it.each(MALFORMED_AUDIO_FIXTURES)(
    'rejects the malformed $formatId fixture',
    async fixture => {
      const bytes = new Uint8Array(
        await readFile(
          join(process.cwd(), 'tests/fixtures/audio', fixture.fileName)
        )
      );
      expect(sniffAudioBytes(bytes, bytes.length)).toBeNull();
    }
  );
});

const userId = 'user-1';
const pathname = `jovie/audio/library/${encodeURIComponent(userId)}/track.wav`;

function wavBytes(): Uint8Array {
  const bytes = new Uint8Array(48);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, 40, true);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8);
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12);
  view.setUint32(16, 16, true);
  bytes.set([0xe9], 20);
  bytes.set([0x64, 0x61, 0x74, 0x61], 36);
  view.setUint32(40, 4, true);
  bytes.set([0xff, 0x00, 0x7f, 0xe9], 44);
  return bytes;
}

function mockStoredBytes(bytes: Uint8Array) {
  vi.mocked(head).mockResolvedValue({
    pathname,
    url: 'https://blob.example/track.wav',
    size: bytes.length,
    contentType: 'audio/wav',
    uploadedAt: new Date('2026-09-25T00:00:00.000Z'),
  } as Awaited<ReturnType<typeof head>>);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => bytes.buffer,
    }))
  );
}

describe('verifyAudioBlob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('accepts a WAV whose container tags are byte values', async () => {
    const bytes = wavBytes();
    mockStoredBytes(bytes);

    const result = await verifyAudioBlob({
      blobUrl: 'https://blob.example/track.wav',
      blobPathname: pathname,
      userId,
      surface: 'library',
      fileName: 'track.wav',
      fileMimeType: 'audio/wav',
      maxSizeBytes: 1_000_000,
    });

    expect(result.formatId).toBe('wav');
    expect(result.sizeBytes).toBe(bytes.length);
    expect(result.pathname).toBe(pathname);
  });

  it('rejects bytes that do not spell a supported container', async () => {
    const bytes = Uint8Array.from([0xe9, 0xff, 0x00, 0x7f, 0x10, 0x20]);
    mockStoredBytes(bytes);

    try {
      await verifyAudioBlob({
        blobUrl: 'https://blob.example/track.wav',
        blobPathname: pathname,
        userId,
        surface: 'library',
        fileName: 'track.wav',
        fileMimeType: 'audio/wav',
        maxSizeBytes: 1_000_000,
      });
      expect.fail('expected the bytes to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(AudioBlobVerificationError);
      expect(error).toMatchObject({ code: 'audio.blob_bytes' });
    }
  });
});

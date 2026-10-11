import { head } from '@vercel/blob';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FileBlobVerificationError,
  sniffFileBytes,
  verifyFileBlob,
} from './file-blob-verifier';

vi.mock('@vercel/blob', () => ({
  head: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function bytesFrom(...groups: (number[] | string)[]): Uint8Array {
  const parts = groups.map(group =>
    typeof group === 'string'
      ? Uint8Array.from(group, char => char.codePointAt(0) ?? 0)
      : Uint8Array.from(group)
  );
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('sniffFileBytes', () => {
  it('recognizes a real JPEG signature', () => {
    expect(sniffFileBytes(bytesFrom([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
  });

  it('recognizes a real PNG signature', () => {
    expect(
      sniffFileBytes(
        bytesFrom([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
    ).toBe('png');
  });

  it('recognizes a GIF signature', () => {
    expect(sniffFileBytes(bytesFrom('GIF89a'))).toBe('gif');
  });

  it('recognizes a WebP RIFF container', () => {
    expect(sniffFileBytes(bytesFrom('RIFF', [0, 0, 0, 0], 'WEBP'))).toBe(
      'webp'
    );
  });

  it('recognizes an AVI RIFF container', () => {
    expect(sniffFileBytes(bytesFrom('RIFF', [0, 0, 0, 0], 'AVI '))).toBe('avi');
  });

  it('recognizes a PDF signature', () => {
    expect(sniffFileBytes(bytesFrom('%PDF-1.7'))).toBe('pdf');
  });

  it('recognizes an MP4 ISO-BMFF ftyp box', () => {
    expect(sniffFileBytes(bytesFrom([0, 0, 0, 0x18], 'ftyp', 'isom'))).toBe(
      'mp4'
    );
  });

  it('recognizes a QuickTime MOV ftyp brand', () => {
    expect(sniffFileBytes(bytesFrom([0, 0, 0, 0x18], 'ftyp', 'qt  '))).toBe(
      'mov'
    );
  });

  it('recognizes an AVIF ftyp brand', () => {
    expect(sniffFileBytes(bytesFrom([0, 0, 0, 0x18], 'ftyp', 'avif'))).toBe(
      'avif'
    );
  });

  it('recognizes a WebM EBML header', () => {
    expect(sniffFileBytes(bytesFrom([0x1a, 0x45, 0xdf, 0xa3]))).toBe('webm');
  });

  it('returns null for unrecognized bytes (e.g. a renamed executable)', () => {
    expect(sniffFileBytes(bytesFrom('MZ', [0x90, 0x00, 0x03]))).toBeNull();
  });
});

const userId = 'user-1';
const pathname = `jovie/files/chat/${encodeURIComponent(userId)}/photo.jpg`;

function mockStoredBytes(bytes: Uint8Array, contentType = 'image/jpeg') {
  vi.mocked(head).mockResolvedValue({
    pathname,
    url: 'https://blob.example/photo.jpg',
    size: bytes.length,
    contentType,
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

describe('verifyFileBlob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('accepts a JPEG whose bytes match the declared type', async () => {
    mockStoredBytes(bytesFrom([0xff, 0xd8, 0xff, 0xe0]));

    const result = await verifyFileBlob({
      blobPathname: pathname,
      userId,
      surface: 'chat',
      fileName: 'photo.jpg',
      fileMimeType: 'image/jpeg',
      maxSizeBytes: 1024,
    });

    expect(result.formatId).toBe('jpeg');
    expect(result.url).toBe('https://blob.example/photo.jpg');
  });

  it('rejects a file whose bytes do not match the declared image type', async () => {
    // Declared as PNG but the stored bytes are actually a JPEG.
    mockStoredBytes(bytesFrom([0xff, 0xd8, 0xff, 0xe0]), 'image/png');

    await expect(
      verifyFileBlob({
        blobPathname: pathname,
        userId,
        surface: 'chat',
        fileName: 'photo.png',
        fileMimeType: 'image/png',
        maxSizeBytes: 1024,
      })
    ).rejects.toMatchObject({
      code: 'file.blob_mismatch',
    });
  });

  it('rejects a spoofed upload with no recognizable signature', async () => {
    mockStoredBytes(bytesFrom('MZ', [0x90, 0x00, 0x03]));

    await expect(
      verifyFileBlob({
        blobPathname: pathname,
        userId,
        surface: 'chat',
        fileName: 'photo.jpg',
        fileMimeType: 'image/jpeg',
        maxSizeBytes: 1024,
      })
    ).rejects.toBeInstanceOf(FileBlobVerificationError);
  });

  it('rejects a pathname outside the caller-owned prefix', async () => {
    await expect(
      verifyFileBlob({
        blobPathname: `jovie/files/chat/${encodeURIComponent('other-user')}/photo.jpg`,
        userId,
        surface: 'chat',
        fileName: 'photo.jpg',
        fileMimeType: 'image/jpeg',
        maxSizeBytes: 1024,
      })
    ).rejects.toMatchObject({ code: 'file.blob_ownership' });
    expect(head).not.toHaveBeenCalled();
  });

  it('rejects a size reported above the surface limit', async () => {
    vi.mocked(head).mockResolvedValue({
      pathname,
      url: 'https://blob.example/photo.jpg',
      size: 2048,
      contentType: 'image/jpeg',
      uploadedAt: new Date('2026-09-25T00:00:00.000Z'),
    } as Awaited<ReturnType<typeof head>>);

    await expect(
      verifyFileBlob({
        blobPathname: pathname,
        userId,
        surface: 'chat',
        fileName: 'photo.jpg',
        fileMimeType: 'image/jpeg',
        maxSizeBytes: 1024,
      })
    ).rejects.toMatchObject({ code: 'file.blob_metadata' });
  });

  it('accepts plain text without a byte-signature check', async () => {
    mockStoredBytes(bytesFrom('anything goes here'), 'text/plain');

    const result = await verifyFileBlob({
      blobPathname: pathname,
      userId,
      surface: 'chat',
      fileName: 'notes.txt',
      fileMimeType: 'text/plain',
      maxSizeBytes: 1024,
    });

    expect(result.formatId).toBe('txt');
  });
});

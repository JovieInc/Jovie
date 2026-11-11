import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Chat page first-load guard. `@vercel/blob/client` brings `jose` and
 * `@vercel/oidc` (about 94 KB) into whatever imports it statically. The chat
 * composer needs it only when someone attaches a file, so the attachment hooks
 * and the recording upload reach it through `uploadPresignedLazy`, which imports it on first upload.
 */
const { uploadPresignedMock } = vi.hoisted(() => ({
  uploadPresignedMock: vi.fn(),
}));

vi.mock('@vercel/blob/client', () => ({
  uploadPresigned: uploadPresignedMock,
}));

const webRoot = path.resolve(__dirname, '../../..');
// Every upload path the chat page reaches: attachments, and the teleprompter
// recording card that tool-ui renders.
const HOOKS = [
  'components/jovie/hooks/useChatAudioAttachments.ts',
  'components/jovie/hooks/useChatFileAttachments.ts',
  'lib/capture/upload-account-video.ts',
];

describe('chat upload SDK stays out of the chat entry bundle', () => {
  beforeEach(() => {
    uploadPresignedMock.mockReset();
  });

  it.each(HOOKS)('%s has no static import of @vercel/blob/client', file => {
    const source = readFileSync(path.join(webRoot, file), 'utf8');
    expect(source).not.toMatch(
      /import\s+(?!type\b)[^;]*from\s+'@vercel\/blob\/client'/
    );
    expect(source).toContain("from '@/lib/blob/upload-presigned-lazy'");
  });

  it('passes every argument through and returns the upload result', async () => {
    const { uploadPresignedLazy } = await import(
      '@/lib/blob/upload-presigned-lazy'
    );
    const result = { url: 'https://blob.example/file.wav' };
    uploadPresignedMock.mockResolvedValue(result);
    const file = new Blob(['audio']);
    const options: Parameters<typeof uploadPresignedLazy>[2] = {
      access: 'public',
      handleUploadUrl: '/api/library/audio/upload-token',
      contentType: 'audio/wav',
    };

    await expect(
      uploadPresignedLazy('chat/u1/file.wav', file, options)
    ).resolves.toBe(result);
    expect(uploadPresignedMock).toHaveBeenCalledWith(
      'chat/u1/file.wav',
      file,
      options
    );
  });

  it('surfaces upload failures to the caller', async () => {
    const { uploadPresignedLazy } = await import(
      '@/lib/blob/upload-presigned-lazy'
    );
    uploadPresignedMock.mockRejectedValue(new Error('network down'));

    await expect(
      uploadPresignedLazy(
        'chat/u1/file.wav',
        new Blob(['x']),
        {} as Parameters<typeof uploadPresignedLazy>[2]
      )
    ).rejects.toThrow('network down');
  });
});

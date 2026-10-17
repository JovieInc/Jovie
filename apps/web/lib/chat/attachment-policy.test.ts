import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadChatAttachments,
  isChatUploadUrl,
  validateChatMessageParts,
} from '@/lib/chat/attachment-policy';
import { UPLOADABLE_FILE_CONTENT_TYPES } from '@/lib/media/file-policy';

const blobUrl =
  'https://test-store.public.blob.vercel-storage.com/jovie/files/chat/user/cover.png';
const file = { type: 'file', mediaType: 'image/png', url: blobUrl };
const passwordOnlyUrl = new URL(blobUrl);
passwordOnlyUrl.password = 'synthetic';
const invalidUrls = [
  '',
  '/file.png',
  'not a URL',
  'http://test-store.public.blob.vercel-storage.com/file.png',
  'https://example.com/file.png',
  'https://127.0.0.1/file.png',
  'https://2130706433/file.png',
  'https://[::1]/file.png',
  'https://169.254.169.254/file.png',
  'https://blob.vercel-storage.com/file.png',
  'https://test-store.private.blob.vercel-storage.com/file.png',
  'https://test-store.public.blob.vercel-storage.com.evil.example/file.png',
  'https://test-store.public.blob.vercel-storage.com@evil.example/file.png',
  'https://user@test-store.public.blob.vercel-storage.com/file.png',
  passwordOnlyUrl.href,
  'https://test-store.public.blob.vercel-storage.com:8443/file.png',
  'https://test-store.public.blob.vercel-storage.com/',
  'https://test-store.public.blob.vercel-storage.com./file.png',
  ' https://test-store.public.blob.vercel-storage.com/file.png',
  'https://test-store.public.blob.vercel-storage.com/fi\nle.png',
  'https://test-store.public.blob.vercel-storage.com\\file.png',
  'file:///etc/hosts',
  'ftp://test-store.public.blob.vercel-storage.com/file.png',
  'blob:https://example.com/file.png',
  'data:text/html;base64,PGh0bWw+',
];

afterEach(() => vi.unstubAllGlobals());

describe('chat upload URL policy', () => {
  it.each([
    blobUrl,
    'https://test-store.blob.vercel-storage.com/cover.png',
    'https://TEST-STORE.public.blob.vercel-storage.com/cover.png',
    'https://test-store.public.blob.vercel-storage.com:443/cover.png',
  ])('accepts the supported public upload URL %s', url => {
    expect(isChatUploadUrl(url)).toBe(true);
  });

  it.each(invalidUrls)('rejects the untrusted URL %s', url => {
    expect(isChatUploadUrl(url)).toBe(false);
    expect(validateChatMessageParts([{ ...file, url }])).toBe(
      'Invalid file attachment'
    );
  });
});

describe('chat message part validation', () => {
  it.each(UPLOADABLE_FILE_CONTENT_TYPES)(
    'preserves the upload policy MIME %s',
    mediaType => {
      expect(validateChatMessageParts([{ ...file, mediaType }])).toBeNull();
    }
  );

  it('preserves text, tools, and source parts without treating displayed links as files', () => {
    expect(
      validateChatMessageParts([
        { type: 'text', text: 'Read https://example.com' },
        {
          type: 'tool-searchSpotifyArtist',
          toolCallId: 'tool-1',
          state: 'output-available',
          output: {},
        },
        {
          type: 'source-url',
          sourceId: 'source-1',
          url: 'https://example.com',
        },
      ])
    ).toBeNull();
    expect(validateChatMessageParts([])).toBeNull();
  });

  it('preserves supported inline base64 attachments', () => {
    expect(
      validateChatMessageParts([
        { ...file, url: 'data:image/png;base64,iVBORw0KGgo=' },
      ])
    ).toBeNull();
    expect(
      validateChatMessageParts([
        {
          ...file,
          mediaType: 'text/plain',
          url: 'data:text/plain;base64,dGVzdA==',
        },
      ])
    ).toBeNull();
  });

  it.each([
    'data:image/jpeg;base64,dGVzdA==',
    'data:image/png;base64,',
    'data:image/png;base64,!invalid',
    'data:image/png;base64,a===',
    'data:image/png,https://example.com/file.png',
  ])('rejects mismatched or malformed inline data %s', url => {
    expect(validateChatMessageParts([{ ...file, url }])).toBe(
      'Invalid file attachment'
    );
  });

  it.each([
    undefined,
    '',
    '*/*',
    'image/*',
    'application/javascript',
    'application/zip',
    'image/heic',
    'audio/mpeg',
  ])('rejects unsupported attachment media types %s', mediaType => {
    expect(validateChatMessageParts([{ ...file, mediaType }])).toBe(
      'Invalid file attachment'
    );
  });

  it('rejects missing and non-string attachment URLs', () => {
    expect(
      validateChatMessageParts([{ type: 'file', mediaType: 'image/png' }])
    ).toBe('Invalid file attachment');
    expect(validateChatMessageParts([{ ...file, url: 42 }])).toBe(
      'Invalid file attachment'
    );
  });

  it.each([null, false, 42, 'text', [], {}, { type: 1 }, { type: '' }])(
    'rejects malformed parts %j',
    part => {
      expect(validateChatMessageParts([part])).toBe('Invalid message part');
    }
  );

  it('rejects malformed text rather than throwing during text extraction', () => {
    expect(validateChatMessageParts([{ type: 'text' }])).toBe(
      'Invalid text part'
    );
  });
});

describe('SDK attachment download guard', () => {
  it('returns ordered pass-through entries without network access for supported uploads', async () => {
    const fetchTrap = vi.fn(() => {
      throw new Error('Unexpected network access');
    });
    vi.stubGlobal('fetch', fetchTrap);
    await expect(
      downloadChatAttachments([
        { url: new URL(blobUrl), isUrlSupportedByModel: true },
        {
          url: new URL(
            'https://test-store.blob.vercel-storage.com/document.pdf'
          ),
          isUrlSupportedByModel: true,
        },
      ])
    ).resolves.toEqual([null, null]);
    await expect(downloadChatAttachments([])).resolves.toEqual([]);
    expect(fetchTrap).not.toHaveBeenCalled();
  });

  it.each([
    {
      url: new URL('https://example.com/file.png'),
      isUrlSupportedByModel: true,
    },
    { url: new URL('http://127.0.0.1/file.png'), isUrlSupportedByModel: false },
    { url: new URL(blobUrl), isUrlSupportedByModel: false },
  ])('rejects unsafe or unsupported SDK downloads %j', async download => {
    await expect(downloadChatAttachments([download])).rejects.toThrow(
      'Unsupported chat attachment'
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildFileBlobPath,
  CHAT_FILE_ACCEPT,
  CHAT_FILE_BATCH_MAX_SIZE_BYTES,
  CHAT_FILE_MAX_FILE_SIZE_BYTES,
  CHAT_FILE_MAX_FILES_PER_MESSAGE,
  detectChatFileKind,
  FILE_FORMAT_REGISTRY,
  FILE_UPLOAD_POLICIES,
  getAllowedUploadContentTypes,
  getCanonicalMimeTypeByFileName,
  getFileBlobPathPrefix,
  getFileFormat,
  resolveChatFileUploadMime,
  resolveFileUploadSurface,
  UPLOADABLE_FILE_CONTENT_TYPES,
  validateChatFileUpload,
} from './file-policy';

describe('file policy registry invariants (JOV-5872)', () => {
  it('has unique ids, lowercase MIME aliases, and canonical MIME in aliases', () => {
    const ids = FILE_FORMAT_REGISTRY.map(format => format.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const format of FILE_FORMAT_REGISTRY) {
      expect(format.mimeTypes).toContain(format.canonicalMimeType);
      for (const mime of format.mimeTypes) {
        expect(mime).toBe(mime.toLowerCase());
      }
      expect(format.extensions.length).toBeGreaterThan(0);
    }
  });

  it('never maps one extension or MIME to two formats', () => {
    const extensions = FILE_FORMAT_REGISTRY.flatMap(f => f.extensions);
    const mimes = FILE_FORMAT_REGISTRY.flatMap(f => f.mimeTypes);
    expect(new Set(extensions).size).toBe(extensions.length);
    expect(new Set(mimes).size).toBe(mimes.length);
  });

  it('keeps the size limits literal and exact', () => {
    expect(CHAT_FILE_MAX_FILE_SIZE_BYTES).toBe(500 * 1024 * 1024);
    expect(CHAT_FILE_BATCH_MAX_SIZE_BYTES).toBe(5 * 1024 * 1024 * 1024);
    expect(CHAT_FILE_MAX_FILES_PER_MESSAGE).toBe(20);
    expect(FILE_UPLOAD_POLICIES.chat.maxFileSizeBytes).toBe(
      CHAT_FILE_MAX_FILE_SIZE_BYTES
    );
  });

  it('only exposes as-is uploadable MIME types to storage tokens', () => {
    expect(UPLOADABLE_FILE_CONTENT_TYPES).toContain('image/jpeg');
    expect(UPLOADABLE_FILE_CONTENT_TYPES).toContain('video/mp4');
    expect(UPLOADABLE_FILE_CONTENT_TYPES).toContain('application/pdf');
    expect(UPLOADABLE_FILE_CONTENT_TYPES).not.toContain('image/heic');
    expect(UPLOADABLE_FILE_CONTENT_TYPES).not.toContain('application/zip');
    expect(UPLOADABLE_FILE_CONTENT_TYPES).not.toContain(
      'application/octet-stream'
    );
  });

  it('scopes account_video tokens to video only', () => {
    const allowed = getAllowedUploadContentTypes('account_video');
    expect(allowed).toContain('video/webm');
    expect(allowed).not.toContain('image/jpeg');
    expect(allowed).not.toContain('application/pdf');
    expect(getAllowedUploadContentTypes('chat')).toEqual(
      UPLOADABLE_FILE_CONTENT_TYPES
    );
  });

  it('accept string covers files (incl. convert/expand) and audio', () => {
    expect(CHAT_FILE_ACCEPT).toContain('image/heic');
    expect(CHAT_FILE_ACCEPT).toContain('application/zip');
    expect(CHAT_FILE_ACCEPT).toContain('.mov');
    expect(CHAT_FILE_ACCEPT).toContain('audio/mpeg');
    expect(CHAT_FILE_ACCEPT).toContain('.wav');
  });
});

describe('format resolution', () => {
  it('resolves by MIME first, then extension for blank/octet-stream', () => {
    expect(getFileFormat({ name: 'x.bin', type: 'image/jpg' })?.id).toBe(
      'jpeg'
    );
    expect(getFileFormat({ name: 'clip.MOV', type: '' })?.id).toBe('mov');
    expect(
      getFileFormat({ name: 'deck.pdf', type: 'application/octet-stream' })?.id
    ).toBe('pdf');
    expect(getFileFormat({ name: 'x.png', type: 'text/csv' })).toBeNull();
    expect(getFileFormat({ name: 'x.bmp', type: 'image/bmp' })).toBeNull();
  });

  it('detects kinds and lets audio-contracts own audio', () => {
    expect(detectChatFileKind({ name: 'a.mp3', type: 'audio/mpeg' })).toBe(
      'audio'
    );
    expect(detectChatFileKind({ name: 'a.mp3', type: '' })).toBe('audio');
    expect(detectChatFileKind({ name: 'a.ogg', type: 'audio/ogg' })).toBe(
      'audio'
    );
    expect(detectChatFileKind({ name: 'a.heic', type: 'image/heic' })).toBe(
      'image'
    );
    expect(detectChatFileKind({ name: 'a.zip', type: 'application/zip' })).toBe(
      'archive'
    );
    expect(detectChatFileKind({ name: 'a.exe', type: '' })).toBe('other');
  });

  it('resolves the canonical upload MIME only for as-is uploads', () => {
    expect(
      resolveChatFileUploadMime({ name: 'a.jpg', type: 'image/jpg' })
    ).toBe('image/jpeg');
    expect(resolveChatFileUploadMime({ name: 'a.avi', type: '' })).toBe(
      'video/x-msvideo'
    );
    expect(
      resolveChatFileUploadMime({ name: 'a.heic', type: 'image/heic' })
    ).toBeNull();
    expect(
      resolveChatFileUploadMime({ name: 'a.zip', type: 'application/zip' })
    ).toBeNull();
    expect(resolveChatFileUploadMime({ name: 'a.csv', type: '' })).toBeNull();
  });

  it('maps extensions to canonical MIME across files and audio', () => {
    expect(getCanonicalMimeTypeByFileName('a.jpeg')).toBe('image/jpeg');
    expect(getCanonicalMimeTypeByFileName('a.flac')).toBe('audio/flac');
    expect(getCanonicalMimeTypeByFileName('a.unknownext')).toBeNull();
  });
});

describe('validateChatFileUpload', () => {
  it('names the supported-types rule for unknown or off-surface formats', () => {
    const rejected = validateChatFileUpload({
      name: 'a.csv',
      type: 'text/csv',
      size: 10,
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.code).toBe('file.supported_types');
    expect(rejected.rule).toContain('Supported types');
    expect(rejected.message).toContain('text/csv');
    expect(rejected.cta.action).toBe('pick_another');

    const offSurface = validateChatFileUpload(
      { name: 'a.pdf', type: 'application/pdf', size: 10 },
      'account_video'
    );
    expect(offSurface.ok).toBe(false);
  });

  it('names the max-size rule with the size in MB', () => {
    const rejected = validateChatFileUpload({
      name: 'master.mov',
      type: 'video/quicktime',
      size: CHAT_FILE_MAX_FILE_SIZE_BYTES + 1,
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.code).toBe('file.max_file_size_bytes');
    expect(rejected.rule).toBe('Max file size: 500 MB');
    expect(rejected.cta.action).toBe('compress');
  });

  it('accepts in-policy files, including convert/expand transports', () => {
    expect(
      validateChatFileUpload({ name: 'a.heic', type: 'image/heic', size: 1 })
    ).toEqual({ ok: true });
    expect(
      validateChatFileUpload({
        name: 'a.zip',
        type: 'application/zip',
        size: 1,
      })
    ).toEqual({ ok: true });
    expect(
      validateChatFileUpload({ name: 'a.mp4', type: '', size: 1 })
    ).toEqual({ ok: true });
  });
});

describe('owner-scoped Blob paths', () => {
  it('builds paths under the owner prefix with a sanitized name', () => {
    const path = buildFileBlobPath('chat', 'user_1', 'My Track (final)!.mp4');
    expect(path.startsWith(getFileBlobPathPrefix('chat', 'user_1'))).toBe(true);
    expect(path).toMatch(/\/[0-9a-f-]{36}-My-Track-final-.mp4$/);
    expect(path).not.toContain(' ');
    expect(getFileBlobPathPrefix('account_video', 'a/b')).toBe(
      'jovie/files/account_video/a%2Fb/'
    );
  });

  it('resolves only the caller’s own surface prefixes', () => {
    expect(
      resolveFileUploadSurface('jovie/files/chat/user_1/x-a.jpg', 'user_1')
    ).toBe('chat');
    expect(
      resolveFileUploadSurface(
        'jovie/files/account_video/user_1/x-a.webm',
        'user_1'
      )
    ).toBe('account_video');
    expect(
      resolveFileUploadSurface('jovie/files/chat/user_2/x-a.jpg', 'user_1')
    ).toBeNull();
    expect(resolveFileUploadSurface('a.jpg', 'user_1')).toBeNull();
    expect(
      resolveFileUploadSurface('jovie/files/chat/user_1/../x.jpg', 'user_1')
    ).toBeNull();
    expect(
      resolveFileUploadSurface('jovie/audio/chat/user_1/x.mp3', 'user_1')
    ).toBeNull();
  });
});

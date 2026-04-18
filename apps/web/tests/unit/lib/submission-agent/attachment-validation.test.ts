import { describe, expect, it } from 'vitest';
import {
  validateSubmissionImageAsset,
  validateXperiArtworkAttachment,
} from '@/lib/submission-agent/artifacts/attachment-validation';

describe('submission attachment validation', () => {
  it('rejects unsupported image assets', () => {
    const issues = validateSubmissionImageAsset({
      kind: 'press_photo',
      filename: 'photo.webp',
      mimeType: 'image/webp',
      url: '/relative/path.webp',
    });

    expect(issues).toContain('photo.webp: asset URL must be absolute');
    expect(issues).toContain('photo.webp: unsupported mime type image/webp');
    expect(issues).toContain('photo.webp: unsupported image extension');
  });

  it('enforces Xperi artwork filename rules', () => {
    const issues = validateXperiArtworkAttachment(
      {
        kind: 'release_artwork',
        filename: 'cover.jpg',
        mimeType: 'image/jpeg',
        url: 'https://cdn.example.com/cover.jpg',
      },
      '123456789012'
    );

    expect(issues).toContain(
      'cover.jpg: cover art filename must match 123456789012.jpg'
    );
  });
});

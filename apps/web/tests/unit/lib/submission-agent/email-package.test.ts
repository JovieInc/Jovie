import { describe, expect, it } from 'vitest';
import {
  buildSubmissionPackage,
  computeAttachmentChecksum,
} from '@/lib/submission-agent/artifacts/email-package';
import type {
  CanonicalSubmissionContext,
  SubmissionAttachment,
} from '@/lib/submission-agent/types';

function createCanonical(
  overrides: Partial<CanonicalSubmissionContext> = {}
): CanonicalSubmissionContext {
  return {
    profileId: 'profile-1',
    artistName: 'Dua <Lipa>',
    artistBio: 'Pop artist',
    artistContactEmail: 'artist@example.com',
    replyToEmail: 'reply@example.com',
    release: {
      id: 'release-1',
      title: 'Future Nostalgia <Deluxe>',
      releaseType: 'album',
      releaseDate: new Date('2025-08-15T00:00:00Z'),
      label: 'Warner',
      upc: '123456789012',
      totalTracks: 11,
      artworkUrl: 'https://example.com/artwork.jpg',
      genres: ['pop'],
      catalogNumber: 'CAT-001',
    },
    tracks: [],
    pressPhotos: [],
    ...overrides,
  };
}

describe('submission-agent/email-package.ts', () => {
  it('computes a deterministic attachment checksum', () => {
    expect(computeAttachmentChecksum('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('builds a package with escaped html and release metadata', () => {
    const attachments: SubmissionAttachment[] = [
      {
        kind: 'release_artwork',
        filename: 'cover-art.png',
        mimeType: 'image/png',
        checksum: 'checksum-1',
      },
      {
        kind: 'artist_bio',
        filename: 'bio.txt',
        mimeType: 'text/plain',
        checksum: 'checksum-2',
      },
    ];

    const result = buildSubmissionPackage({
      canonical: createCanonical(),
      subject: 'Submission package',
      greeting: 'Hello <team>',
      bodyIntro: 'Please review & approve.',
      attachments,
      monitoringBaseline: { hasBio: true },
    });

    expect(result.subject).toBe('Submission package');
    expect(result.attachments).toEqual(attachments);
    expect(result.monitoringBaseline).toEqual({ hasBio: true });
    expect(result.text).toContain('Artist: Dua <Lipa>');
    expect(result.text).toContain('Release: Future Nostalgia <Deluxe>');
    expect(result.text).toContain('Release Date: 2025-08-15');
    expect(result.text).toContain('Reply-To: reply@example.com');
    expect(result.text).toContain('- cover-art.png');
    expect(result.html).toContain('Hello &lt;team&gt;');
    expect(result.html).toContain('Future Nostalgia &lt;Deluxe&gt;');
    expect(result.html).toContain('Please review &amp; approve.');
    expect(result.html).toContain('<li>cover-art.png</li><li>bio.txt</li>');
  });

  it('falls back to placeholder values when release and reply-to are missing', () => {
    const result = buildSubmissionPackage({
      canonical: createCanonical({
        artistContactEmail: null,
        replyToEmail: null,
        release: null,
      }),
      subject: 'Fallback package',
      greeting: 'Hi there',
      bodyIntro: 'Missing release metadata',
      attachments: [],
      monitoringBaseline: {},
    });

    expect(result.text).toContain('Release: Untitled release');
    expect(result.text).toContain('Release Date: Unknown');
    expect(result.text).toContain('Reply-To: Not provided');
    expect(result.html).toContain('Untitled release');
    expect(result.html).toContain('Unknown');
    expect(result.html).toContain('Not provided');
  });
});

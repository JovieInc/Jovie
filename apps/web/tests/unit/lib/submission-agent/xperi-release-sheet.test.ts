import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildXperiReleaseSheetAttachment } from '@/lib/submission-agent/artifacts/xperi-release-sheet';
import type { CanonicalSubmissionContext } from '@/lib/submission-agent/types';

function makeCanonicalContext(): CanonicalSubmissionContext {
  return {
    profileId: 'profile_123',
    artistName: 'Test Artist',
    artistBio: 'A short artist biography.',
    artistContactEmail: 'artist@example.com',
    replyToEmail: 'artist@example.com',
    release: {
      id: 'release_123',
      title: 'Test Release',
      releaseType: 'single',
      releaseDate: new Date('2026-03-01T00:00:00.000Z'),
      label: 'Jovie Records',
      upc: '123456789012',
      totalTracks: 2,
      artworkUrl: 'https://cdn.example.com/release.jpg',
      genres: ['Pop'],
      catalogNumber: 'JOV-100',
    },
    tracks: [
      {
        title: 'Intro',
        trackNumber: 1,
        discNumber: 1,
        performer: 'Test Artist',
        composers: ['Test Artist'],
        durationMs: 180_000,
        credits: ['Test Artist - Main Artist'],
      },
      {
        title: 'Outro',
        trackNumber: 2,
        discNumber: 1,
        performer: 'Test Artist',
        composers: ['Test Artist', 'Co Writer'],
        durationMs: 200_000,
        credits: ['Co Writer - Composer'],
      },
    ],
    pressPhotos: [],
  };
}

describe('buildXperiReleaseSheetAttachment', () => {
  it('creates an xlsx attachment with the official Xperi columns', async () => {
    const attachment = await buildXperiReleaseSheetAttachment(
      makeCanonicalContext()
    );

    expect(attachment.filename).toBe('123456789012.xlsx');
    expect(attachment.mimeType).toContain('spreadsheetml');
    expect(attachment.contentBase64).toBeTruthy();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(attachment.contentBase64!, 'base64'));
    const worksheet = workbook.getWorksheet('AlbumTrack');
    expect(worksheet).toBeDefined();

    const rows = worksheet!
      .getSheetValues()
      .slice(1)
      .map(row => {
        if (!Array.isArray(row)) {
          return [];
        }

        return row.slice(1) as Array<string | number>;
      });

    expect(rows[0]).toEqual([
      'Type',
      'Product Format',
      'UPC',
      'Name',
      'Title',
      'Label Name',
      'Total No Tracks',
      'Media Number',
      'Cat Number',
      'Release Date',
      'Track No',
      'Track',
      'Composer',
      'Artist/Performer',
      'Track Time',
      'Genre',
      'Credits',
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[1]?.slice(0, 6)).toEqual([
      'Single',
      'Digital',
      '123456789012',
      'Test Artist',
      'Test Release',
      'Jovie Records',
    ]);
    expect(rows[2]?.[11]).toBe('Outro');
    expect(rows[2]?.[12]).toBe('Test Artist/Co Writer');
  });
});

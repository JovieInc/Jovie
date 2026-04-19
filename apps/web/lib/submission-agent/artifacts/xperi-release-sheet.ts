import ExcelJS from 'exceljs';
import type {
  CanonicalSubmissionContext,
  SubmissionAttachment,
} from '../types';
import { computeAttachmentChecksum } from './email-package';

const XPERI_HEADERS = [
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
] as const;

function formatReleaseType(releaseType: string): string {
  switch (releaseType.toLowerCase()) {
    case 'album':
      return 'Album';
    case 'ep':
      return 'EP';
    case 'single':
      return 'Single';
    default:
      return 'Album';
  }
}

function formatTrackDuration(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) {
    return '';
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getXperiReferenceId(
  canonical: CanonicalSubmissionContext
): string {
  const release = canonical.release;
  if (!release) {
    return canonical.profileId;
  }

  return release.upc?.trim() || release.id;
}

export async function buildXperiReleaseSheetAttachment(
  canonical: CanonicalSubmissionContext
): Promise<SubmissionAttachment> {
  if (!canonical.release) {
    throw new Error('Xperi release sheet requires a release');
  }

  const release = canonical.release;
  const referenceId = getXperiReferenceId(canonical);
  const rows: Array<Array<string | number>> = [Array.from(XPERI_HEADERS)];

  for (const track of canonical.tracks) {
    rows.push([
      formatReleaseType(release.releaseType),
      'Digital',
      referenceId,
      canonical.artistName,
      release.title,
      release.label ?? '',
      release.totalTracks || canonical.tracks.length,
      track.discNumber,
      release.catalogNumber ?? referenceId,
      release.releaseDate ? release.releaseDate.toISOString().slice(0, 10) : '',
      track.trackNumber,
      track.title,
      track.composers.join('/') || canonical.artistName,
      track.performer,
      formatTrackDuration(track.durationMs),
      release.genres[0] ?? '',
      track.credits.join('; '),
    ]);
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('AlbumTrack');
  rows.forEach(row => {
    worksheet.addRow(row);
  });

  const workbookBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(workbookBuffer)
    ? workbookBuffer
    : Buffer.from(workbookBuffer);
  const contentBase64 = buffer.toString('base64');

  return {
    kind: 'xperi_release_sheet',
    filename: `${referenceId}.xlsx`,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    contentBase64,
    checksum: computeAttachmentChecksum(contentBase64),
  };
}

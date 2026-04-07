/**
 * Promo Download Thank-You Email Template
 *
 * Sent after OTP verification succeeds. Contains download links
 * for all active files in the release's promo gate.
 */

import { APP_NAME } from '@/constants/app';
import { BASE_URL } from '@/constants/domains';
import { escapeHtml } from '../utils';

export interface PromoDownloadFile {
  title: string;
  downloadUrl: string;
  fileMimeType: string;
  fileSizeBytes: number | null;
}

export interface PromoDownloadThankYouTemplateData {
  /** Release title */
  releaseTitle: string;
  /** Artist display name */
  artistName: string;
  /** Artist username/handle */
  artistHandle: string;
  /** Release artwork URL (optional) */
  artworkUrl?: string | null;
  /** Download files with signed URLs */
  files: PromoDownloadFile[];
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': 'MP3',
    'audio/wav': 'WAV',
    'audio/flac': 'FLAC',
    'audio/aiff': 'AIFF',
    'audio/mp4': 'M4A',
    'audio/x-m4a': 'M4A',
  };
  return map[mimeType] ?? 'Audio';
}

export function getPromoDownloadThankYouSubject(
  data: PromoDownloadThankYouTemplateData
): string {
  return `Your download from ${data.artistName} is ready`;
}

export function getPromoDownloadThankYouText(
  data: PromoDownloadThankYouTemplateData
): string {
  const fileList = data.files
    .map(f => {
      const size = formatFileSize(f.fileSizeBytes);
      const ext = formatExtension(f.fileMimeType);
      return `- ${f.title} (${ext}${size ? `, ${size}` : ''}): ${f.downloadUrl}`;
    })
    .join('\n');

  const profileUrl = `${BASE_URL}/${data.artistHandle}`;
  const prefsUrl = `${profileUrl}/notifications`;

  return `Your download from ${data.artistName} is ready.

${fileList}

These links expire in 1 hour. After that, visit the release page to re-verify.

You've been added to ${data.artistName}'s promo list.
Manage preferences: ${prefsUrl}

${APP_NAME}`;
}

export function getPromoDownloadThankYouHtml(
  data: PromoDownloadThankYouTemplateData
): string {
  const safeTitle = escapeHtml(data.releaseTitle);
  const safeArtist = escapeHtml(data.artistName);
  const profileUrl = `${BASE_URL}/${data.artistHandle}`;
  const prefsUrl = `${profileUrl}/notifications`;

  const artworkSection = data.artworkUrl
    ? `<img src="${escapeHtml(data.artworkUrl)}" alt="${safeTitle}" width="80" height="80" style="border-radius:8px;margin-bottom:16px;" />`
    : '';

  const fileRows = data.files
    .map(f => {
      const size = formatFileSize(f.fileSizeBytes);
      const ext = formatExtension(f.fileMimeType);
      const safeFileTitle = escapeHtml(f.title);
      return `
        <tr>
          <td style="padding:8px 0;">
            <a href="${escapeHtml(f.downloadUrl)}" style="color:#111;text-decoration:none;font-weight:500;">
              ${safeFileTitle}
            </a>
            <span style="color:#999;font-size:12px;margin-left:8px;">${ext}${size ? ` / ${size}` : ''}</span>
          </td>
          <td style="padding:8px 0;text-align:right;">
            <a href="${escapeHtml(f.downloadUrl)}" style="display:inline-block;padding:6px 12px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">
              Download
            </a>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 0;">
      ${artworkSection}
      <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#111;">
        ${safeTitle}
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#666;">
        by ${safeArtist}
      </p>
      <table style="width:100%;border-collapse:collapse;">
        ${fileRows}
      </table>
      <p style="margin:24px 0 0;font-size:12px;color:#999;">
        These links expire in 1 hour. After that, visit the release page to re-verify.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
      <p style="font-size:12px;color:#999;margin:0;">
        You've been added to ${safeArtist}'s promo list.
        <a href="${prefsUrl}" style="color:#666;">Manage preferences</a>
      </p>
    </div>
  `;
}

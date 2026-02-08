/**
 * DSP Bio Update Request Email Template
 *
 * Sent to DSP artist support teams on behalf of an artist to request
 * an artist bio update. Professional format designed to maximize
 * acceptance by DSP support teams.
 */

import { APP_NAME } from '@/constants/app';
import { BASE_URL } from '@/constants/domains';
import { escapeHtml } from '../utils';

export interface DspBioUpdateTemplateData {
  /** Artist's display name */
  artistName: string;
  /** Artist's Jovie username */
  username: string;
  /** The DSP's display name (e.g., "Spotify", "Apple Music") */
  dspDisplayName: string;
  /** The artist's external ID on this DSP (if known) */
  externalArtistId?: string | null;
  /** The artist's profile URL on this DSP (if known) */
  externalArtistUrl?: string | null;
  /** The new bio text to set */
  bioText: string;
  /** The artist's Spotify ID (for cross-reference) */
  spotifyId?: string | null;
  /** The artist's Spotify URL (for cross-reference) */
  spotifyUrl?: string | null;
  /** Reply-to email for the artist (their contact email) */
  artistContactEmail?: string | null;
}

/**
 * Generate the email subject line
 */
export function getDspBioUpdateSubject(data: DspBioUpdateTemplateData): string {
  return `Artist Bio Update Request – ${data.artistName}`;
}

/**
 * Generate plain text email body
 */
export function getDspBioUpdateText(data: DspBioUpdateTemplateData): string {
  const {
    artistName,
    username,
    dspDisplayName,
    externalArtistId,
    externalArtistUrl,
    bioText,
    spotifyId,
    spotifyUrl,
  } = data;

  const profileUrl = `${BASE_URL}/${encodeURIComponent(username)}`;

  const identifierLines: string[] = [];
  if (externalArtistUrl) {
    identifierLines.push(`${dspDisplayName} Profile: ${externalArtistUrl}`);
  }
  if (externalArtistId) {
    identifierLines.push(`${dspDisplayName} Artist ID: ${externalArtistId}`);
  }
  if (spotifyUrl) {
    identifierLines.push(`Spotify Profile: ${spotifyUrl}`);
  } else if (spotifyId) {
    identifierLines.push(`Spotify Artist ID: ${spotifyId}`);
  }
  identifierLines.push(`${APP_NAME} Profile: ${profileUrl}`);

  return `Hello ${dspDisplayName} Artist Support,

I am writing on behalf of ${artistName} to request an update to their artist biography on ${dspDisplayName}.

ARTIST IDENTIFICATION
${identifierLines.join('\n')}

UPDATED BIOGRAPHY
${bioText}

---

Please update the artist biography with the text above at your earliest convenience. If you need any additional verification or information, please reply to this email.

Thank you for your support.

Best regards,
${APP_NAME} Artist Services
${BASE_URL}

---
This is an authorized request sent via ${APP_NAME} on behalf of the artist.
If you have questions about this service, visit ${BASE_URL} or reply to this email.`;
}

/**
 * Generate HTML email body
 */
export function getDspBioUpdateHtml(data: DspBioUpdateTemplateData): string {
  const {
    artistName,
    username,
    dspDisplayName,
    externalArtistId,
    externalArtistUrl,
    bioText,
    spotifyId,
    spotifyUrl,
  } = data;

  const profileUrl = `${BASE_URL}/${encodeURIComponent(username)}`;

  const safeArtistName = escapeHtml(artistName);
  const safeDspName = escapeHtml(dspDisplayName);
  const safeBioText = escapeHtml(bioText);
  const safeUsername = escapeHtml(username);

  // Build identifier rows
  const identifierRows: string[] = [];
  if (externalArtistUrl) {
    identifierRows.push(`
      <tr>
        <td style="padding: 4px 12px 4px 0; font-weight: 600; color: #555; white-space: nowrap; vertical-align: top;">${safeDspName} Profile</td>
        <td style="padding: 4px 0;"><a href="${escapeHtml(externalArtistUrl)}" style="color: #2563eb; text-decoration: none;">${escapeHtml(externalArtistUrl)}</a></td>
      </tr>
    `);
  }
  if (externalArtistId) {
    identifierRows.push(`
      <tr>
        <td style="padding: 4px 12px 4px 0; font-weight: 600; color: #555; white-space: nowrap; vertical-align: top;">${safeDspName} Artist ID</td>
        <td style="padding: 4px 0; font-family: monospace; color: #333;">${escapeHtml(externalArtistId)}</td>
      </tr>
    `);
  }
  if (spotifyUrl) {
    identifierRows.push(`
      <tr>
        <td style="padding: 4px 12px 4px 0; font-weight: 600; color: #555; white-space: nowrap; vertical-align: top;">Spotify Profile</td>
        <td style="padding: 4px 0;"><a href="${escapeHtml(spotifyUrl)}" style="color: #2563eb; text-decoration: none;">${escapeHtml(spotifyUrl)}</a></td>
      </tr>
    `);
  } else if (spotifyId) {
    identifierRows.push(`
      <tr>
        <td style="padding: 4px 12px 4px 0; font-weight: 600; color: #555; white-space: nowrap; vertical-align: top;">Spotify Artist ID</td>
        <td style="padding: 4px 0; font-family: monospace; color: #333;">${escapeHtml(spotifyId)}</td>
      </tr>
    `);
  }
  identifierRows.push(`
    <tr>
      <td style="padding: 4px 12px 4px 0; font-weight: 600; color: #555; white-space: nowrap; vertical-align: top;">${APP_NAME} Profile</td>
      <td style="padding: 4px 0;"><a href="${profileUrl}" style="color: #2563eb; text-decoration: none;">${BASE_URL}/${safeUsername}</a></td>
    </tr>
  `);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artist Bio Update Request – ${safeArtistName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; color: #333;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px; border-bottom: 1px solid #e5e7eb;">
              <h1 style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #111;">
                Artist Bio Update Request
              </h1>
              <p style="margin: 0; font-size: 14px; color: #666;">
                On behalf of <strong>${safeArtistName}</strong>
              </p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 24px 40px 0;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">
                Hello ${safeDspName} Artist Support,
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                I am writing on behalf of <strong>${safeArtistName}</strong> to request an update to their artist biography on ${safeDspName}.
              </p>
            </td>
          </tr>

          <!-- Artist Identification -->
          <tr>
            <td style="padding: 0 40px 24px;">
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px;">
                <h2 style="margin: 0 0 12px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">
                  Artist Identification
                </h2>
                <table role="presentation" style="width: 100%; font-size: 14px; line-height: 1.5;">
                  ${identifierRows.join('')}
                </table>
              </div>
            </td>
          </tr>

          <!-- Updated Biography -->
          <tr>
            <td style="padding: 0 40px 24px;">
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 16px;">
                <h2 style="margin: 0 0 12px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #16a34a;">
                  Updated Biography
                </h2>
                <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #333; white-space: pre-wrap;">${safeBioText}</p>
              </div>
            </td>
          </tr>

          <!-- Closing -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #555;">
                Please update the artist biography with the text above at your earliest convenience. If you need any additional verification or information, please reply to this email.
              </p>
              <p style="margin: 0 0 4px; font-size: 14px; color: #555;">Best regards,</p>
              <p style="margin: 0; font-size: 14px; font-weight: 600; color: #333;">${APP_NAME} Artist Services</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 11px; color: #9ca3af; text-align: center;">
                This is an authorized request sent via <a href="${BASE_URL}" style="color: #6b7280; text-decoration: underline;">${APP_NAME}</a> on behalf of the artist.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Get complete email content for a DSP bio update request
 */
export function getDspBioUpdateEmail(data: DspBioUpdateTemplateData) {
  return {
    subject: getDspBioUpdateSubject(data),
    text: getDspBioUpdateText(data),
    html: getDspBioUpdateHtml(data),
  };
}

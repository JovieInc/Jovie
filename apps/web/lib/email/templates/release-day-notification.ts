/**
 * Release Day Notification Email Template
 *
 * Sent to fans when an artist's release is now available.
 */

import { APP_NAME } from '@/constants/app';
import { BASE_URL } from '@/constants/domains';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ProviderKey } from '@/lib/discography/types';
import { escapeHtml } from '../utils';

export interface ReleaseDayNotificationData {
  /** Artist's display name */
  artistName: string;
  /** Release title */
  releaseTitle: string;
  /** Release artwork URL */
  artworkUrl: string | null;
  /** Artist's username/handle */
  username: string;
  /** Release slug */
  slug: string;
  /** Streaming links for the release */
  streamingLinks: Array<{ providerId: string; url: string }>;
}

/**
 * Build the release page URL with encoded path segments
 */
function buildReleaseUrl(username: string, slug: string): string {
  return `${BASE_URL}/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`;
}

/**
 * Build the manage notifications URL with encoded path segments
 */
function buildManageNotificationsUrl(username: string): string {
  return `${BASE_URL}/${encodeURIComponent(username)}`;
}

/**
 * Get provider label from config
 */
function getProviderLabel(providerId: string): string {
  const config = PROVIDER_CONFIG[providerId as ProviderKey];
  return config?.label ?? providerId;
}

/**
 * Generate the email subject line
 */
export function getReleaseDayNotificationSubject(
  data: ReleaseDayNotificationData
): string {
  return `${data.artistName} just dropped new music`;
}

/**
 * Generate plain text email body
 */
export function getReleaseDayNotificationText(
  data: ReleaseDayNotificationData
): string {
  const { artistName, releaseTitle, username, slug, streamingLinks } = data;
  const releaseUrl = buildReleaseUrl(username, slug);

  const linksList = streamingLinks
    .slice(0, 4)
    .map(link => `- ${getProviderLabel(link.providerId)}: ${link.url}`)
    .join('\n');

  return `${artistName} just dropped new music

"${releaseTitle}" is out now.

Listen here:
${linksList}

Or view all platforms: ${releaseUrl}

---
You're getting this because you asked to be notified.
To unsubscribe, visit: ${buildManageNotificationsUrl(username)}`;
}

/**
 * Generate HTML email body
 */
export function getReleaseDayNotificationHtml(
  data: ReleaseDayNotificationData
): string {
  const {
    artistName,
    releaseTitle,
    artworkUrl,
    username,
    slug,
    streamingLinks,
  } = data;
  const releaseUrl = buildReleaseUrl(username, slug);

  // Escape user-provided values to prevent XSS
  const safeArtistName = escapeHtml(artistName);
  const safeReleaseTitle = escapeHtml(releaseTitle);
  const safeArtworkUrl = artworkUrl ? escapeHtml(artworkUrl) : null;

  // Build streaming link buttons
  const streamingButtons = streamingLinks
    .slice(0, 4)
    .map(link => {
      const label = getProviderLabel(link.providerId);
      const config = PROVIDER_CONFIG[link.providerId as ProviderKey];
      const accent = config?.accent ?? '#000000';

      return `
        <a href="${escapeHtml(link.url)}" target="_blank" style="display: inline-block; margin: 4px; padding: 10px 20px; background-color: ${accent}; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
          ${escapeHtml(label)}
        </a>
      `;
    })
    .join('');

  const artworkSection = safeArtworkUrl
    ? `
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${safeArtworkUrl}" alt="${safeReleaseTitle}" style="width: 200px; height: 200px; border-radius: 12px; object-fit: cover; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
      </div>
    `
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeArtistName} just dropped new music</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 16px; text-align: center;">
              <span style="font-size: 12px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 1px;">${APP_NAME}</span>
            </td>
          </tr>

          <!-- Artwork -->
          <tr>
            <td style="padding: 0 32px;">
              ${artworkSection}
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 16px 32px 24px;">
              <h1 style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #000; text-align: center;">
                ${safeArtistName} just dropped new music
              </h1>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.5; color: #333; text-align: center;">
                "<strong>${safeReleaseTitle}</strong>" is out now.
              </p>

              <!-- Streaming Buttons -->
              <div style="text-align: center; margin-bottom: 24px;">
                ${streamingButtons}
              </div>

              <!-- More Platforms Link -->
              <div style="text-align: center;">
                <a href="${escapeHtml(releaseUrl)}" style="font-size: 14px; color: #666; text-decoration: underline;">
                  View all platforms
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9f9f9; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
                You're getting this because you asked to be notified.
              </p>
              <p style="margin: 8px 0 0; font-size: 12px; color: #999; text-align: center;">
                <a href="${escapeHtml(buildManageNotificationsUrl(username))}" style="color: #999; text-decoration: underline;">
                  Manage notifications
                </a>
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
 * Get complete email content for a release day notification
 */
export function getReleaseDayNotificationEmail(
  data: ReleaseDayNotificationData
) {
  return {
    subject: getReleaseDayNotificationSubject(data),
    text: getReleaseDayNotificationText(data),
    html: getReleaseDayNotificationHtml(data),
  };
}

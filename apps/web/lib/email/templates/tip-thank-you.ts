/**
 * Tip Thank-You Email Template
 *
 * Sent to fans after they tip a creator, thanking them and sharing
 * the creator's music and social links.
 */

import { APP_NAME, LEGAL } from '@/constants/app';
import { BASE_URL, getProfileUrl } from '@/constants/domains';
import { formatAmount } from '@/lib/utils/format-number';
import { escapeHtml } from '../utils';

export interface TipThankYouTemplateData {
  /** Fan's name (if known) */
  fanName?: string | null;
  /** Creator's display name */
  artistName: string;
  /** Creator's username/handle */
  profileHandle: string;
  /** Creator's avatar URL */
  artistPhoto?: string | null;
  /** Tip amount in cents */
  amountCents: number;
  /** Music streaming links */
  musicLinks?: {
    spotify?: string | null;
    appleMusic?: string | null;
    youtube?: string | null;
  };
  /** Social links (platform name -> URL) */
  socialLinks?: Array<{ platform: string; url: string }>;
  /** Unsubscribe token for the footer */
  unsubscribeToken?: string | null;
  /** Profile ID for opt-in CTA */
  profileId: string;
}

/**
 * Generate the email subject line
 */
export function getTipThankYouSubject(data: TipThankYouTemplateData): string {
  return `Thanks for supporting ${data.artistName}!`;
}

/**
 * Generate plain text email body
 */
export function getTipThankYouText(data: TipThankYouTemplateData): string {
  const { fanName, artistName, profileHandle, amountCents, musicLinks } = data;
  const greeting = fanName ? `Hey ${fanName},` : 'Hey there,';
  const profileUrl = getProfileUrl(profileHandle);
  const amount = formatAmount(amountCents);

  const musicSection = [];
  if (musicLinks?.spotify) musicSection.push(`Spotify: ${musicLinks.spotify}`);
  if (musicLinks?.appleMusic)
    musicSection.push(`Apple Music: ${musicLinks.appleMusic}`);
  if (musicLinks?.youtube) musicSection.push(`YouTube: ${musicLinks.youtube}`);

  const unsubscribeUrl = data.unsubscribeToken
    ? `${BASE_URL}/api/audience/unsubscribe?token=${encodeURIComponent(data.unsubscribeToken)}`
    : null;

  return `${greeting}

Your ${amount} tip means the world to ${artistName}. Thank you for your support!

Check out more from ${artistName}: ${profileUrl}

${musicSection.length > 0 ? `Listen to ${artistName}:\n${musicSection.join('\n')}\n` : ''}
- The ${APP_NAME} Team

---
${unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : ''}
Privacy Policy: ${BASE_URL}${LEGAL.privacyPath}`;
}

/**
 * Build a styled button for HTML emails
 */
function buildLinkButton(
  label: string,
  url: string,
  bgColor = '#000',
  textColor = '#fff'
): string {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `
    <a href="${safeUrl}" style="display: inline-block; padding: 10px 20px; background-color: ${bgColor}; color: ${textColor}; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; margin: 4px;">
      ${safeLabel}
    </a>
  `;
}

/**
 * Generate HTML email body
 */
export function getTipThankYouHtml(data: TipThankYouTemplateData): string {
  const {
    fanName,
    artistName,
    profileHandle,
    artistPhoto,
    amountCents,
    musicLinks,
    socialLinks,
    profileId,
  } = data;

  const safeArtistName = escapeHtml(artistName);
  const safeFanName = fanName ? escapeHtml(fanName) : null;
  const amount = formatAmount(amountCents);
  const profileUrl = getProfileUrl(profileHandle);

  const greeting = safeFanName ? `Hey ${safeFanName},` : 'Hey there,';

  // Artist photo section
  const photoSection = artistPhoto
    ? `
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${escapeHtml(artistPhoto)}" alt="${safeArtistName}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;" />
      </div>
    `
    : '';

  // Music links section
  const musicButtons: string[] = [];
  if (musicLinks?.spotify)
    musicButtons.push(
      buildLinkButton('Spotify', musicLinks.spotify, '#1DB954', '#fff')
    );
  if (musicLinks?.appleMusic)
    musicButtons.push(
      buildLinkButton('Apple Music', musicLinks.appleMusic, '#FC3C44', '#fff')
    );
  if (musicLinks?.youtube)
    musicButtons.push(
      buildLinkButton('YouTube', musicLinks.youtube, '#FF0000', '#fff')
    );

  const musicSection =
    musicButtons.length > 0
      ? `
      <div style="border-top: 1px solid #eee; padding-top: 24px; margin-top: 24px;">
        <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #333; text-align: center;">
          Listen to ${safeArtistName}
        </p>
        <div style="text-align: center;">
          ${musicButtons.join('\n')}
        </div>
      </div>
    `
      : '';

  // Social links section
  const socialSection =
    socialLinks && socialLinks.length > 0
      ? `
      <div style="padding-top: 16px; margin-top: 16px; text-align: center;">
        ${socialLinks
          .map(
            link =>
              `<a href="${escapeHtml(link.url)}" style="display: inline-block; margin: 4px 8px; font-size: 13px; color: #666; text-decoration: underline;">${escapeHtml(link.platform)}</a>`
          )
          .join('\n')}
      </div>
    `
      : '';

  // Unsubscribe URL
  const unsubscribeUrl = data.unsubscribeToken
    ? `${BASE_URL}/api/audience/unsubscribe?token=${encodeURIComponent(data.unsubscribeToken)}`
    : null;
  const safeUnsubscribeUrl = unsubscribeUrl ? escapeHtml(unsubscribeUrl) : null;

  // Opt-in CTA URL
  const optInUrl = `${BASE_URL}/api/audience/opt-in?email=${encodeURIComponent(data.profileId)}&profileId=${encodeURIComponent(profileId)}`;
  const safeOptInUrl = escapeHtml(optInUrl);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thanks for supporting ${safeArtistName}!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 0;">
              <div style="text-align: center; margin-bottom: 8px;">
                <span style="font-size: 24px; font-weight: 700; color: #000;">${APP_NAME}</span>
              </div>
            </td>
          </tr>

          <!-- Artist Photo -->
          <tr>
            <td style="padding: 24px 40px 0;">
              ${photoSection}
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 24px 40px;">
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #000; text-align: center;">
                Thanks for supporting ${safeArtistName}!
              </h1>
              <p style="margin: 0 0 8px; font-size: 16px; line-height: 1.6; color: #333; text-align: center;">
                ${greeting}
              </p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #333; text-align: center;">
                Your ${amount} tip means the world to ${safeArtistName}. Thank you for your generous support.
              </p>

              <!-- Profile Link -->
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${escapeHtml(profileUrl)}" style="display: inline-block; padding: 14px 32px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  See More from ${safeArtistName}
                </a>
              </div>

              <!-- Music Links -->
              ${musicSection}

              <!-- Social Links -->
              ${socialSection}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9f9f9; border-top: 1px solid #eee;">
              <!-- Opt-in CTA -->
              <div style="text-align: center; margin-bottom: 16px;">
                <p style="margin: 0 0 8px; font-size: 13px; color: #666;">
                  Want to hear about upcoming shows and new releases?
                </p>
                <a href="${safeOptInUrl}" style="display: inline-block; padding: 8px 20px; border: 1px solid #ddd; color: #333; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                  Stay Updated
                </a>
              </div>

              ${
                safeUnsubscribeUrl
                  ? `
              <p style="margin: 12px 0 0; font-size: 11px; color: #bbb; text-align: center;">
                <a href="${safeUnsubscribeUrl}" style="color: #999; text-decoration: underline;">Unsubscribe</a>
              </p>
              `
                  : ''
              }

              <p style="margin: 8px 0 0; font-size: 11px; color: #bbb; text-align: center;">
                <a href="${escapeHtml(`${BASE_URL}${LEGAL.privacyPath}`)}" style="color: #999; text-decoration: underline;">Privacy Policy</a>
              </p>

              <p style="margin: 8px 0 0; font-size: 11px; color: #bbb; text-align: center;">
                Sent by ${APP_NAME} on behalf of ${safeArtistName}
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
 * Get complete email content for a tip thank-you
 */
export function getTipThankYouEmail(data: TipThankYouTemplateData) {
  return {
    subject: getTipThankYouSubject(data),
    text: getTipThankYouText(data),
    html: getTipThankYouHtml(data),
  };
}

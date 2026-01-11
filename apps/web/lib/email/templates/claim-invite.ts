/**
 * Claim Invite Email Template
 *
 * Sent to creators when an admin invites them to claim their pre-built profile.
 */

import { APP_NAME } from '@/constants/app';
import { getAppUrl, getProfileUrl, PROFILE_URL } from '@/constants/domains';

export interface ClaimInviteTemplateData {
  /** Creator's display name or username */
  creatorName: string;
  /** Creator's username/handle */
  username: string;
  /** The claim token for the profile */
  claimToken: string;
  /** Optional profile avatar URL */
  avatarUrl?: string | null;
  /** Optional fit score for personalization */
  fitScore?: number | null;
}

/**
 * Escape HTML special characters to prevent XSS in email templates.
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Build the claim URL with token
 */
export function buildClaimUrl(username: string, claimToken: string): string {
  return `${getAppUrl('/claim')}?token=${encodeURIComponent(claimToken)}&username=${encodeURIComponent(username)}`;
}

/**
 * Build the preview URL (public profile)
 */
export function buildPreviewUrl(username: string): string {
  return getProfileUrl(username);
}

/**
 * Generate the email subject line
 */
export function getClaimInviteSubject(_data: ClaimInviteTemplateData): string {
  return `Your ${APP_NAME} profile is ready to claim`;
}

/**
 * Generate plain text email body
 */
export function getClaimInviteText(data: ClaimInviteTemplateData): string {
  const { creatorName, username, claimToken } = data;
  const claimUrl = buildClaimUrl(username, claimToken);
  const previewUrl = buildPreviewUrl(username);

  return `Hey ${creatorName},

We built you a ${APP_NAME} profile at ${PROFILE_URL}/${username}

${APP_NAME} is a smart link-in-bio for musicians. Your profile is already set up with your links, music, and socials.

Preview your profile: ${previewUrl}

Claim it now (takes 30 seconds): ${claimUrl}

Why claim?
- Shorter, cleaner URL than Linktree (${PROFILE_URL}/${username})
- Automatically syncs your latest releases
- Capture fan emails and grow your audience
- Free forever, no credit card required

The claim link expires in 30 days.

Questions? Just reply to this email.

- The ${APP_NAME} Team

---
You received this because we created a profile for you based on your public music presence.
If this wasn't you, you can ignore this email.`;
}

/**
 * Generate HTML email body
 */
export function getClaimInviteHtml(data: ClaimInviteTemplateData): string {
  const { creatorName, username, claimToken, avatarUrl } = data;
  const claimUrl = buildClaimUrl(username, claimToken);
  const previewUrl = buildPreviewUrl(username);

  // Escape user-provided values to prevent XSS
  const safeCreatorName = escapeHtml(creatorName);
  const safeUsername = escapeHtml(username);
  const safeAvatarUrl = avatarUrl ? escapeHtml(avatarUrl) : null;

  const avatarSection = safeAvatarUrl
    ? `
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${safeAvatarUrl}" alt="${safeCreatorName}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;" />
      </div>
    `
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claim your ${APP_NAME} profile</title>
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

          <!-- Avatar -->
          <tr>
            <td style="padding: 24px 40px 0;">
              ${avatarSection}
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 24px 40px;">
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #000; text-align: center;">
                Hey ${safeCreatorName}
              </h1>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #333; text-align: center;">
                We built you a ${APP_NAME} profile. It's already set up with your links, music, and socials.
              </p>

              <!-- Profile Preview Card -->
              <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
                <p style="margin: 0 0 8px; font-size: 14px; color: #666;">Your profile URL:</p>
                <a href="${previewUrl}" style="font-size: 18px; font-weight: 600; color: #000; text-decoration: none;">
                  ${PROFILE_URL}/${safeUsername}
                </a>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${claimUrl}" style="display: inline-block; padding: 14px 32px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Claim Your Profile
                </a>
              </div>

              <p style="margin: 0 0 24px; font-size: 14px; color: #666; text-align: center;">
                Takes 30 seconds. Free forever.
              </p>

              <!-- Benefits -->
              <div style="border-top: 1px solid #eee; padding-top: 24px;">
                <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #333;">Why ${APP_NAME}?</p>
                <ul style="margin: 0; padding: 0 0 0 20px; font-size: 14px; line-height: 1.8; color: #555;">
                  <li>Shorter, cleaner URL than Linktree</li>
                  <li>Automatically syncs your latest releases</li>
                  <li>Capture fan emails and grow your audience</li>
                  <li>Built specifically for musicians</li>
                </ul>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9f9f9; border-top: 1px solid #eee;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #999; text-align: center;">
                This link expires in 30 days.
              </p>
              <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
                You received this because we created a profile for you based on your public music presence.
                <br>If this wasn't you, you can ignore this email.
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
 * Get complete email content for a claim invite
 */
export function getClaimInviteEmail(data: ClaimInviteTemplateData) {
  return {
    subject: getClaimInviteSubject(data),
    text: getClaimInviteText(data),
    html: getClaimInviteHtml(data),
  };
}

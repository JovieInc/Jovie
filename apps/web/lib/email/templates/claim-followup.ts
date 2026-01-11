/**
 * Follow-up Email Templates for Claim Invites
 *
 * Different messaging for each follow-up step to increase claim conversions
 * without being spammy.
 */

import { APP_NAME } from '@/constants/app';
import { PROFILE_URL } from '@/constants/domains';

import { buildClaimUrl, buildPreviewUrl } from './claim-invite';

export interface FollowUpTemplateData {
  /** Creator's display name or username */
  creatorName: string;
  /** Creator's username/handle */
  username: string;
  /** The claim token for the profile */
  claimToken: string;
  /** The sequence step (1 = first follow-up, 2 = second follow-up) */
  sequenceStep: number;
  /** Days until claim link expires */
  daysUntilExpiry?: number;
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
 * Get subject line based on sequence step
 */
export function getFollowUpSubject(data: FollowUpTemplateData): string {
  const { sequenceStep, daysUntilExpiry } = data;

  switch (sequenceStep) {
    case 1:
      return `Quick reminder: your ${APP_NAME} profile is waiting`;
    case 2:
      return daysUntilExpiry && daysUntilExpiry <= 7
        ? `Last chance: your ${APP_NAME} profile link expires soon`
        : `Still here: your ${APP_NAME} profile is ready`;
    default:
      return `Your ${APP_NAME} profile is still available`;
  }
}

/**
 * Get plain text body for first follow-up
 */
function getFirstFollowUpText(data: FollowUpTemplateData): string {
  const { creatorName, username, claimToken } = data;
  const claimUrl = buildClaimUrl(username, claimToken);
  const previewUrl = buildPreviewUrl(username);

  return `Hey ${creatorName},

Just a quick follow-up - your ${APP_NAME} profile is still waiting for you at ${PROFILE_URL}/${username}

We set it up with your music, links, and socials. All you need to do is claim it.

Preview: ${previewUrl}
Claim it: ${claimUrl}

It only takes 30 seconds and it's free.

- The ${APP_NAME} Team

---
You received this because we created a profile for you. Reply to unsubscribe.`;
}

/**
 * Get plain text body for second (final) follow-up
 */
function getSecondFollowUpText(data: FollowUpTemplateData): string {
  const { creatorName, username, claimToken, daysUntilExpiry } = data;
  const claimUrl = buildClaimUrl(username, claimToken);
  const previewUrl = buildPreviewUrl(username);

  const expiryNote =
    daysUntilExpiry && daysUntilExpiry <= 7
      ? `Your claim link expires in ${daysUntilExpiry} days.`
      : 'Your claim link will expire soon.';

  return `Hey ${creatorName},

Last note from us - your ${APP_NAME} profile is still unclaimed.

${expiryNote}

After that, someone else could claim the username ${username}.

Preview: ${previewUrl}
Claim now: ${claimUrl}

We won't email you again about this.

- The ${APP_NAME} Team

---
You received this because we created a profile for you. Reply to unsubscribe.`;
}

/**
 * Get plain text email body based on sequence step
 */
export function getFollowUpText(data: FollowUpTemplateData): string {
  switch (data.sequenceStep) {
    case 1:
      return getFirstFollowUpText(data);
    case 2:
      return getSecondFollowUpText(data);
    default:
      return getFirstFollowUpText(data);
  }
}

/**
 * Get HTML body for first follow-up - shorter and more casual
 */
function getFirstFollowUpHtml(data: FollowUpTemplateData): string {
  const { creatorName, username, claimToken } = data;
  const claimUrl = buildClaimUrl(username, claimToken);
  const previewUrl = buildPreviewUrl(username);

  const safeCreatorName = escapeHtml(creatorName);
  const safeUsername = escapeHtml(username);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quick reminder</title>
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

          <!-- Main Content -->
          <tr>
            <td style="padding: 24px 40px;">
              <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #000;">
                Hey ${safeCreatorName}, quick reminder
              </h1>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #333;">
                Your ${APP_NAME} profile is still waiting at <strong>${PROFILE_URL}/${safeUsername}</strong>
              </p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #333;">
                We set it up with your music and links. Just need you to claim it.
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${claimUrl}" style="display: inline-block; padding: 14px 32px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Claim Your Profile
                </a>
              </div>

              <p style="margin: 0; font-size: 14px; color: #666; text-align: center;">
                <a href="${previewUrl}" style="color: #666;">Preview your profile first</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9f9f9; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
                Reply to unsubscribe from these reminders.
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
 * Get HTML body for second (final) follow-up - adds urgency
 */
function getSecondFollowUpHtml(data: FollowUpTemplateData): string {
  const { creatorName, username, claimToken, daysUntilExpiry } = data;
  const claimUrl = buildClaimUrl(username, claimToken);
  const previewUrl = buildPreviewUrl(username);

  const safeCreatorName = escapeHtml(creatorName);
  const safeUsername = escapeHtml(username);

  const expiryNote =
    daysUntilExpiry && daysUntilExpiry <= 7
      ? `Your claim link expires in <strong>${daysUntilExpiry} days</strong>.`
      : 'Your claim link will expire soon.';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Last reminder</title>
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

          <!-- Main Content -->
          <tr>
            <td style="padding: 24px 40px;">
              <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #000;">
                Hey ${safeCreatorName}, last note from us
              </h1>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #333;">
                Your ${APP_NAME} profile at <strong>${PROFILE_URL}/${safeUsername}</strong> is still unclaimed.
              </p>

              <!-- Urgency Box -->
              <div style="background: #fff3cd; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 14px; color: #856404;">
                  ${expiryNote} After that, someone else could claim the username <strong>${safeUsername}</strong>.
                </p>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${claimUrl}" style="display: inline-block; padding: 14px 32px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Claim Now
                </a>
              </div>

              <p style="margin: 0; font-size: 14px; color: #666; text-align: center;">
                <a href="${previewUrl}" style="color: #666;">Preview your profile</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9f9f9; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
                We won't email you again about this. Reply to ask questions.
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
 * Get HTML email body based on sequence step
 */
export function getFollowUpHtml(data: FollowUpTemplateData): string {
  switch (data.sequenceStep) {
    case 1:
      return getFirstFollowUpHtml(data);
    case 2:
      return getSecondFollowUpHtml(data);
    default:
      return getFirstFollowUpHtml(data);
  }
}

/**
 * Get complete email content for a follow-up
 */
export function getFollowUpEmail(data: FollowUpTemplateData) {
  return {
    subject: getFollowUpSubject(data),
    text: getFollowUpText(data),
    html: getFollowUpHtml(data),
  };
}

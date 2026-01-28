/**
 * Claim Invite Follow-up Email Templates
 *
 * Follow-up emails for the claim invite drip campaign.
 * - Follow-up 1: Sent 3 days after initial invite (if not opened)
 * - Follow-up 2: Sent 7 days after initial invite
 * - Follow-up 3: Sent 14 days after initial invite (final reminder)
 */

import { APP_NAME } from '@/constants/app';
import { getAppUrl, getProfileUrl, PROFILE_URL } from '@/constants/domains';
import {
  buildClickTrackingUrl,
  buildOpenTrackingUrl,
  type TrackingTokenPayload,
} from '@/lib/email/tracking';
import { buildClaimInviteUnsubscribeUrl } from '@/lib/email/unsubscribe-token';
import { escapeHtml } from '../utils';

export interface FollowUpTemplateData {
  /** Creator's display name or username */
  creatorName: string;
  /** Creator's username/handle */
  username: string;
  /** The claim token for the profile */
  claimToken: string;
  /** Optional profile avatar URL */
  avatarUrl?: string | null;
  /** Recipient email address (used for unsubscribe link) */
  recipientEmail?: string;
  /** Invite ID for tracking */
  inviteId?: string;
  /** Provider message ID for tracking attribution */
  providerMessageId?: string;
  /** Follow-up number (1, 2, or 3) */
  followUpNumber: 1 | 2 | 3;
}

/**
 * Build the claim URL with token
 */
function buildClaimUrl(username: string, claimToken: string): string {
  return `${getAppUrl('/claim')}?token=${encodeURIComponent(claimToken)}&username=${encodeURIComponent(username)}`;
}

/**
 * Build tracking payload for this email
 */
function buildTrackingPayload(
  data: FollowUpTemplateData
): TrackingTokenPayload | null {
  if (!data.inviteId || !data.recipientEmail) {
    return null;
  }
  const emailType = `follow_up_${data.followUpNumber}` as const;
  return {
    emailType: emailType as 'follow_up_1' | 'follow_up_2' | 'follow_up_3',
    referenceId: data.inviteId,
    email: data.recipientEmail,
    messageId: data.providerMessageId,
  };
}

/**
 * Wrap a URL with click tracking if tracking is enabled
 */
function wrapWithClickTracking(
  url: string,
  trackingPayload: TrackingTokenPayload | null,
  linkId?: string
): string {
  if (!trackingPayload) {
    return url;
  }
  return buildClickTrackingUrl(trackingPayload, url, linkId) ?? url;
}

/**
 * Get subject line based on follow-up number
 */
export function getFollowUpSubject(data: FollowUpTemplateData): string {
  switch (data.followUpNumber) {
    case 1:
      return `Reminder: Your ${APP_NAME} profile is waiting`;
    case 2:
      return `Last chance to claim your ${APP_NAME} profile`;
    case 3:
      return `Your ${APP_NAME} profile will be removed soon`;
  }
}

/**
 * Get text content based on follow-up number
 */
export function getFollowUpText(data: FollowUpTemplateData): string {
  const { creatorName, username, claimToken, recipientEmail, followUpNumber } =
    data;
  const claimUrl = buildClaimUrl(username, claimToken);
  const unsubscribeUrl = recipientEmail
    ? buildClaimInviteUnsubscribeUrl(recipientEmail)
    : null;

  const unsubscribeSection = unsubscribeUrl
    ? `\n\nDon't want to receive these emails? Unsubscribe: ${unsubscribeUrl}`
    : '';

  const messages = {
    1: `Hey ${creatorName},

We noticed you haven't claimed your ${APP_NAME} profile yet. Your page at ${PROFILE_URL}/${username} is ready and waiting.

Claim it now: ${claimUrl}

It only takes 30 seconds to claim, and it's free forever.

- The ${APP_NAME} Team${unsubscribeSection}`,

    2: `Hey ${creatorName},

This is your last chance to claim your ${APP_NAME} profile before someone else does.

Your page: ${PROFILE_URL}/${username}

Claim now (30 seconds): ${claimUrl}

Once claimed, you'll have a professional link-in-bio that automatically syncs with your music.

- The ${APP_NAME} Team${unsubscribeSection}`,

    3: `Hey ${creatorName},

We'll be removing unclaimed profiles soon. If you'd like to keep yours, claim it now:

${claimUrl}

Your profile at ${PROFILE_URL}/${username} has been set up and is ready to use.

This is the last email we'll send about this.

- The ${APP_NAME} Team${unsubscribeSection}`,
  };

  return messages[followUpNumber];
}

/**
 * Get HTML content based on follow-up number
 */
export function getFollowUpHtml(data: FollowUpTemplateData): string {
  const {
    creatorName,
    username,
    claimToken,
    avatarUrl,
    recipientEmail,
    followUpNumber,
  } = data;
  const claimUrl = buildClaimUrl(username, claimToken);
  const previewUrl = getProfileUrl(username);
  const unsubscribeUrl = recipientEmail
    ? buildClaimInviteUnsubscribeUrl(recipientEmail)
    : null;

  // Build tracking
  const trackingPayload = buildTrackingPayload(data);
  const trackedClaimUrl = wrapWithClickTracking(
    claimUrl,
    trackingPayload,
    'claim_cta'
  );
  const trackedPreviewUrl = wrapWithClickTracking(
    previewUrl,
    trackingPayload,
    'preview'
  );
  const openTrackingPixel = trackingPayload
    ? buildOpenTrackingUrl(trackingPayload)
    : null;

  // Escape user values
  const safeCreatorName = escapeHtml(creatorName);
  const safeUsername = escapeHtml(username);
  const safeAvatarUrl = avatarUrl ? escapeHtml(avatarUrl) : null;
  const safeUnsubscribeUrl = unsubscribeUrl ? escapeHtml(unsubscribeUrl) : null;

  const avatarSection = safeAvatarUrl
    ? `<div style="text-align: center; margin-bottom: 24px;">
        <img src="${safeAvatarUrl}" alt="${safeCreatorName}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;" />
      </div>`
    : '';

  const unsubscribeSection = safeUnsubscribeUrl
    ? `<p style="margin: 12px 0 0; font-size: 11px; color: #bbb; text-align: center;">
        <a href="${safeUnsubscribeUrl}" style="color: #999; text-decoration: underline;">Unsubscribe from these emails</a>
      </p>`
    : '';

  // Different content per follow-up
  const content = getFollowUpContent(
    followUpNumber,
    safeCreatorName,
    safeUsername,
    trackedClaimUrl,
    trackedPreviewUrl
  );

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${getFollowUpSubject(data)}</title>
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
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9f9f9; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
                You received this because we created a profile for you based on your public music presence.
              </p>
              ${unsubscribeSection}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  ${openTrackingPixel ? `<img src="${escapeHtml(openTrackingPixel)}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />` : ''}
</body>
</html>
`;
}

/**
 * Get specific content block based on follow-up number
 */
function getFollowUpContent(
  followUpNumber: 1 | 2 | 3,
  creatorName: string,
  username: string,
  claimUrl: string,
  previewUrl: string
): string {
  switch (followUpNumber) {
    case 1:
      return `
        <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #000; text-align: center;">
          Hey ${creatorName}, your profile is waiting!
        </h1>
        <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #333; text-align: center;">
          We noticed you haven't claimed your ${APP_NAME} profile yet. It's all set up at <a href="${previewUrl}" style="color: #000; font-weight: 600;">${PROFILE_URL}/${username}</a>
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${claimUrl}" style="display: inline-block; padding: 14px 32px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Claim Your Profile
          </a>
        </div>
        <p style="margin: 0; font-size: 14px; color: #666; text-align: center;">
          Takes 30 seconds. Free forever.
        </p>`;

    case 2:
      return `
        <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #000; text-align: center;">
          Last chance, ${creatorName}!
        </h1>
        <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #333; text-align: center;">
          Your ${APP_NAME} profile is still unclaimed. Don't let someone else take <a href="${previewUrl}" style="color: #000; font-weight: 600;">${PROFILE_URL}/${username}</a>
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${claimUrl}" style="display: inline-block; padding: 14px 32px; background-color: #e53e3e; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Claim Now
          </a>
        </div>
        <p style="margin: 0; font-size: 14px; color: #666; text-align: center;">
          Once claimed, you'll get a professional link-in-bio that syncs with your music.
        </p>`;

    case 3:
      return `
        <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #000; text-align: center;">
          Final notice
        </h1>
        <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #333; text-align: center;">
          We'll be removing unclaimed profiles soon. If you'd like to keep yours at <a href="${previewUrl}" style="color: #000; font-weight: 600;">${PROFILE_URL}/${username}</a>, claim it now.
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${claimUrl}" style="display: inline-block; padding: 14px 32px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Keep My Profile
          </a>
        </div>
        <p style="margin: 0; font-size: 14px; color: #999; text-align: center;">
          This is the last email we'll send about this.
        </p>`;
  }
}

/**
 * Get complete follow-up email content
 */
export function getFollowUpEmail(data: FollowUpTemplateData) {
  return {
    subject: getFollowUpSubject(data),
    text: getFollowUpText(data),
    html: getFollowUpHtml(data),
  };
}

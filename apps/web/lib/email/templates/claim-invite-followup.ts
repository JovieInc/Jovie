/**
 * Claim Invite Follow-up Email Templates
 *
 * Follow-up emails for the claim invite drip campaign.
 * - Follow-up 1: Sent 3 days after initial invite (if not opened)
 * - Follow-up 2: Sent 7 days after initial invite
 * - Follow-up 3: Sent 14 days after initial invite (final reminder)
 */

import { APP_NAME } from '@/constants/app';
import { BASE_URL } from '@/constants/domains';
import {
  buildClickTrackingUrl,
  buildOpenTrackingUrl,
  type TrackingTokenPayload,
} from '@/lib/email/tracking';
import { buildClaimInviteUnsubscribeUrl } from '@/lib/email/unsubscribe-token';
import { escapeHtml } from '../utils';
import { resolveSafeFirstName } from './personalization';

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
  return `${BASE_URL}/claim/${encodeURIComponent(claimToken)}`;
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
  const emailType = `follow_up_${data.followUpNumber}` as
    | 'follow_up_1'
    | 'follow_up_2'
    | 'follow_up_3';
  return {
    emailType,
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
      return `Did you see the profile I made for you?`;
    case 2:
      return `Curious what you think`;
    case 3:
      return `Last note on this`;
  }
}

/**
 * Get text content based on follow-up number
 */
export function getFollowUpText(data: FollowUpTemplateData): string {
  const { creatorName, username, claimToken, recipientEmail, followUpNumber } =
    data;
  const claimUrl = buildClaimUrl(username, claimToken);
  const greetingName = resolveSafeFirstName(creatorName, username);
  const salutation = greetingName ? `Hey ${greetingName},` : 'Hey,';
  const unsubscribeUrl = recipientEmail
    ? buildClaimInviteUnsubscribeUrl(recipientEmail)
    : null;

  const unsubscribeSection = unsubscribeUrl
    ? `\n\nDon't want to receive these emails? Unsubscribe: ${unsubscribeUrl}`
    : '';

  const messages = {
    1: `${salutation}

Just bumping this in case you missed it.

Saw you're on Linktree, so I made you a ${APP_NAME} profile.

Claim it here: ${claimUrl}

If you try it, let me know what you think. If you claim it and message me, I'll get it verified.

Cheers,
Tim${unsubscribeSection}`,

    2: `${salutation}

Would still love your take on this.

Claim it here: ${claimUrl}

Even if you don't end up using it, a quick reply on what turned you off would be super helpful.

Cheers,
Tim${unsubscribeSection}`,

    3: `${salutation}

Last note on this.

Claim it here: ${claimUrl}

If you want the profile, grab it here. If you claim it and message me, I'll get it verified.

This is the last email I'll send about it.

Cheers,
Tim${unsubscribeSection}`,
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
  const openTrackingPixel = trackingPayload
    ? buildOpenTrackingUrl(trackingPayload)
    : null;

  // Escape user values
  const greetingName = resolveSafeFirstName(creatorName, username);
  const safeGreetingName = greetingName ? escapeHtml(greetingName) : null;
  const safeAvatarUrl = avatarUrl ? escapeHtml(avatarUrl) : null;
  const safeUnsubscribeUrl = unsubscribeUrl ? escapeHtml(unsubscribeUrl) : null;

  const avatarSection = safeAvatarUrl
    ? `<div style="text-align: center; margin-bottom: 24px;">
        <img src="${safeAvatarUrl}" alt="${escapeHtml(creatorName)}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;" />
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
    safeGreetingName,
    trackedClaimUrl
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
  greetingName: string | null,
  claimUrl: string
): string {
  const heading = greetingName ? `Hey ${greetingName},` : 'Hey,';
  switch (followUpNumber) {
    case 1:
      return `
        <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #000; text-align: center;">
          ${heading}
        </h1>
        <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #333; text-align: center;">
          Just bumping this in case you missed it. Saw you're on Linktree, so I made you a ${APP_NAME} profile.
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${claimUrl}" style="display: inline-block; padding: 14px 32px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Claim Your Profile
          </a>
        </div>
        <p style="margin: 0; font-size: 14px; color: #666; text-align: center;">
          If you try it, let me know what you think. If you claim it and message me, I'll get it verified.
        </p>`;

    case 2:
      return `
        <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #000; text-align: center;">
          ${heading}
        </h1>
        <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #333; text-align: center;">
          Would still love your take on this.
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${claimUrl}" style="display: inline-block; padding: 14px 32px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Claim Your Profile
          </a>
        </div>
        <p style="margin: 0; font-size: 14px; color: #666; text-align: center;">
          Even if you don't end up using it, a quick reply on what turned you off would be super helpful.
        </p>`;

    case 3:
      return `
        <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #000; text-align: center;">
          ${heading}
        </h1>
        <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #333; text-align: center;">
          Last note on this.
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${claimUrl}" style="display: inline-block; padding: 14px 32px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Claim Your Profile
          </a>
        </div>
        <p style="margin: 0; font-size: 14px; color: #999; text-align: center;">
          If you want the profile, grab it here. If you claim it and message me, I'll get it verified. This is the last email I'll send about it.
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

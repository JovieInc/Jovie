/**
 * Campaign Fan Notification Email Template (JOV-2211)
 *
 * Used for campaign-aware fan notifications (draft -> segment -> schedule -> preview -> send).
 * Minimal implementation for demo-critical founder video flow.
 *
 * Reuses escape + URL helpers from the release-day template where possible.
 */

import { APP_NAME } from '@/constants/app';
import { BASE_URL } from '@/constants/domains';
import { escapeHtml } from '../utils';

export interface CampaignFanNotificationData {
  /** Artist's display name */
  artistName: string;
  /** Campaign / drop title (e.g. "Deep End Weekend Tee") */
  campaignTitle: string;
  /** Drafted message body (plain or lightly formatted) */
  body: string;
  /** Primary CTA URL (smart link, campaign page, etc.) */
  ctaUrl: string;
  /** Optional artwork */
  artworkUrl?: string | null;
  /** Artist username for links */
  username: string;
  /** Optional subscriber name for greeting */
  subscriberName?: string | null;
}

function buildManageUrl(username: string): string {
  return `${BASE_URL}/${encodeURIComponent(username)}`;
}

function buildCtaUrl(data: CampaignFanNotificationData): string {
  // Basic normalization; in real use the caller provides a properly built smart link
  if (data.ctaUrl.startsWith('http')) return data.ctaUrl;
  return `${BASE_URL}/${encodeURIComponent(data.username)}`;
}

/**
 * Subject for campaign notification
 */
export function getCampaignFanNotificationSubject(
  data: CampaignFanNotificationData
): string {
  return `${data.artistName} — ${data.campaignTitle}`;
}

/**
 * Plain text version
 */
export function getCampaignFanNotificationText(
  data: CampaignFanNotificationData
): string {
  const safeName = data.subscriberName?.replaceAll(/[\r\n\t]/g, '').trim();
  const greeting = safeName ? `Hey ${safeName}, ` : '';
  const manageUrl = buildManageUrl(data.username);
  const cta = buildCtaUrl(data);

  return `${greeting}${data.artistName} here.

${data.campaignTitle}

${data.body}

${cta}

Manage notifications: ${manageUrl}

— ${data.artistName} via ${APP_NAME}`;
}

/**
 * HTML version (inline-styled, escaped, mobile-friendly)
 */
export function getCampaignFanNotificationHtml(
  data: CampaignFanNotificationData
): string {
  const safeArtist = escapeHtml(data.artistName);
  const safeTitle = escapeHtml(data.campaignTitle);
  const safeBody = escapeHtml(data.body).replaceAll('\n', '<br />');
  const safeName = data.subscriberName ? escapeHtml(data.subscriberName) : null;
  const artwork = data.artworkUrl
    ? `<img src="${escapeHtml(data.artworkUrl)}" alt="${safeTitle}" style="width:180px;height:180px;border-radius:12px;object-fit:cover;margin:0 auto 16px;display:block;" />`
    : '';
  const cta = escapeHtml(buildCtaUrl(data));
  const manage = escapeHtml(buildManageUrl(data.username));

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:32px 16px;">
      <table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
        <tr><td style="padding:24px 24px 8px;text-align:center;">
          <span style="font-size:11px;font-weight:600;letter-spacing:1px;color:#666;text-transform:uppercase;">${APP_NAME}</span>
        </td></tr>
        <tr><td style="padding:0 24px 16px;">
          ${artwork}
          ${safeName ? `<p style="margin:0 0 8px;font-size:14px;color:#666;text-align:center;">Hey ${safeName},</p>` : ''}
          <h1 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#000;text-align:center;line-height:1.3;">${safeTitle}</h1>
          <div style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#333;text-align:center;">${safeBody}</div>
          <div style="text-align:center;margin:20px 0;">
            <a href="${cta}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Listen / Shop now</a>
          </div>
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f9f9f9;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center;">
          You're receiving this because you subscribed to ${safeArtist}.<br/>
          <a href="${manage}" style="color:#999;text-decoration:underline;">Manage notifications</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Full email payload for sendNotification / preview
 */
export function getCampaignFanNotificationEmail(
  data: CampaignFanNotificationData
) {
  return {
    subject: getCampaignFanNotificationSubject(data),
    text: getCampaignFanNotificationText(data),
    html: getCampaignFanNotificationHtml(data),
    // Headers can be added by caller (one-click unsubscribe when subscriber context known)
  };
}

/**
 * Convenience preview renderer (used by demo/agent flows for "preview before schedule").
 * Returns the exact payload that would be sent.
 */
export function getCampaignFanNotificationPreview(
  data: CampaignFanNotificationData
) {
  const email = getCampaignFanNotificationEmail(data);
  return {
    ...email,
    previewFor: {
      artist: data.artistName,
      campaign: data.campaignTitle,
      subscriber: data.subscriberName ?? 'fan',
    },
  };
}

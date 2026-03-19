/**
 * Product Update Email Template
 *
 * Sent to subscribers when a new version is shipped.
 * Includes one-click unsubscribe (RFC 8058).
 */

import { APP_NAME, APP_URL } from '@/constants/app';
import { escapeHtml } from '../utils';

export interface ProductUpdateTemplateData {
  version: string;
  date: string;
  /** Pre-rendered HTML of the changelog entries */
  entriesHtml: string;
  /** Plain text version of entries */
  entriesText: string;
  /** Unsubscribe token for one-click unsubscribe */
  unsubscribeToken: string;
}

export function getProductUpdateSubject(
  data: ProductUpdateTemplateData
): string {
  return `What's new at ${APP_NAME} — v${data.version}`;
}

export function getProductUpdateText(data: ProductUpdateTemplateData): string {
  const unsubscribeUrl = `${APP_URL}/api/changelog/unsubscribe?token=${data.unsubscribeToken}`;

  return `What's new at ${APP_NAME} — v${data.version} (${data.date})

${data.entriesText}

View full changelog: ${APP_URL}/changelog

---
You're receiving this because you subscribed to ${APP_NAME} product updates.
Unsubscribe: ${unsubscribeUrl}`;
}

export function getProductUpdateHtml(data: ProductUpdateTemplateData): string {
  const changelogUrl = `${APP_URL}/changelog`;
  const unsubscribeUrl = `${APP_URL}/api/changelog/unsubscribe?token=${escapeHtml(data.unsubscribeToken)}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>What's new at ${escapeHtml(APP_NAME)}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 16px;">
              <span style="font-size: 12px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(APP_NAME)} PRODUCT UPDATE</span>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td style="padding: 0 32px 8px;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 600; color: #000;">
                What's new — v${escapeHtml(data.version)}
              </h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: #999;">
                ${escapeHtml(data.date)}
              </p>
            </td>
          </tr>

          <!-- Entries -->
          <tr>
            <td style="padding: 16px 32px 24px;">
              <div style="font-size: 15px; line-height: 1.6; color: #333;">
                ${data.entriesHtml}
              </div>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 0 32px 32px; text-align: center;">
              <a href="${escapeHtml(changelogUrl)}" style="display: inline-block; padding: 12px 32px; background-color: #000; color: #fff; text-decoration: none; border-radius: 9999px; font-weight: 500; font-size: 14px;">
                View full changelog
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9f9f9; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
                You're receiving this because you subscribed to ${escapeHtml(APP_NAME)} product updates.
              </p>
              <p style="margin: 8px 0 0; font-size: 12px; color: #999; text-align: center;">
                <a href="${unsubscribeUrl}" style="color: #999; text-decoration: underline;">
                  Unsubscribe
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
 * RFC 8058 one-click unsubscribe headers.
 * Include these when sending via Resend.
 */
export function getProductUpdateUnsubscribeHeaders(
  unsubscribeToken: string
): Record<string, string> {
  const unsubscribeUrl = `${APP_URL}/api/changelog/unsubscribe?token=${unsubscribeToken}`;
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export function getProductUpdateEmail(data: ProductUpdateTemplateData) {
  return {
    subject: getProductUpdateSubject(data),
    text: getProductUpdateText(data),
    html: getProductUpdateHtml(data),
    headers: getProductUpdateUnsubscribeHeaders(data.unsubscribeToken),
  };
}

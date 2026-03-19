/**
 * Changelog Subscription Verification Email Template
 *
 * Sent to non-user subscribers to confirm their email address.
 */

import { APP_NAME, APP_URL } from '@/constants/app';
import { escapeHtml } from '../utils';

export interface ChangelogVerifyTemplateData {
  verificationToken: string;
}

export function getChangelogVerifySubject(): string {
  return `Confirm your subscription to ${APP_NAME} product updates`;
}

export function getChangelogVerifyText(
  data: ChangelogVerifyTemplateData
): string {
  const verifyUrl = `${APP_URL}/api/changelog/verify?token=${data.verificationToken}`;
  return `Confirm your subscription to ${APP_NAME} product updates

Click the link below to confirm:
${verifyUrl}

If you didn't subscribe, you can safely ignore this email.`;
}

export function getChangelogVerifyHtml(
  data: ChangelogVerifyTemplateData
): string {
  const verifyUrl = `${APP_URL}/api/changelog/verify?token=${escapeHtml(data.verificationToken)}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm your subscription</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding: 32px 32px 16px; text-align: center;">
              <span style="font-size: 12px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(APP_NAME)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px 24px; text-align: center;">
              <h1 style="margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #000;">
                Confirm your subscription
              </h1>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.5; color: #333;">
                You're subscribing to product updates from ${escapeHtml(APP_NAME)}. Click below to confirm.
              </p>
              <a href="${verifyUrl}" style="display: inline-block; padding: 12px 32px; background-color: #000; color: #fff; text-decoration: none; border-radius: 9999px; font-weight: 500; font-size: 14px;">
                Confirm subscription
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px; background-color: #f9f9f9; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
                If you didn't subscribe, you can safely ignore this email.
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

export function getChangelogVerifyEmail(data: ChangelogVerifyTemplateData) {
  return {
    subject: getChangelogVerifySubject(),
    text: getChangelogVerifyText(data),
    html: getChangelogVerifyHtml(data),
  };
}

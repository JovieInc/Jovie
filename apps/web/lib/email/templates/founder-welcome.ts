/**
 * Founder Welcome Email Template
 *
 * Sent to new users immediately after signup. Short, personal note from
 * the founder asking if they ran into any issues during onboarding.
 */

import { APP_NAME } from '@/constants/app';
import { escapeHtml } from '../utils';

export interface FounderWelcomeTemplateData {
  /** New user's first name (optional — falls back to a generic greeting) */
  firstName?: string | null;
}

/**
 * Generate the email subject line
 */
export function getFounderWelcomeSubject(): string {
  return `Welcome to ${APP_NAME} — any questions?`;
}

/**
 * Generate plain text email body
 */
export function getFounderWelcomeText(
  data: FounderWelcomeTemplateData
): string {
  const greeting = data.firstName ? `Hey ${data.firstName},` : 'Hey,';

  return `${greeting}

Welcome to ${APP_NAME}! I'm Tim, one of the founders.

I wanted to personally reach out — did you run into any issues during signup or onboarding? Even small friction points are super useful for us to hear about.

Just hit reply if anything felt off. I read every response.

– Tim
${APP_NAME}`;
}

/**
 * Generate HTML email body
 */
export function getFounderWelcomeHtml(
  data: FounderWelcomeTemplateData
): string {
  const greeting = data.firstName
    ? `Hey ${escapeHtml(data.firstName)},`
    : 'Hey,';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 520px; margin: 0 auto;">
          <tr>
            <td style="font-size: 15px; line-height: 1.7; color: #333;">
              <p style="margin: 0 0 16px;">${greeting}</p>
              <p style="margin: 0 0 16px;">Welcome to ${APP_NAME}! I'm Tim, one of the founders.</p>
              <p style="margin: 0 0 16px;">I wanted to personally reach out — did you run into any issues during signup or onboarding? Even small friction points are super useful for us to hear about.</p>
              <p style="margin: 0 0 16px;">Just hit reply if anything felt off. I read every response.</p>
              <p style="margin: 0;">– Tim<br>${APP_NAME}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Get complete email content for a founder welcome
 */
export function getFounderWelcomeEmail(data: FounderWelcomeTemplateData) {
  return {
    subject: getFounderWelcomeSubject(),
    text: getFounderWelcomeText(data),
    html: getFounderWelcomeHtml(data),
  };
}

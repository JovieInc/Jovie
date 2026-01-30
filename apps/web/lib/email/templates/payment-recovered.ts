/**
 * Payment Recovered Email Template
 *
 * Sent to users when their subscription payment succeeds after previous failures.
 * Confirms their Pro access has been restored.
 */

import { APP_NAME } from '@/constants/app';
import { getAppUrl } from '@/constants/domains';
import { escapeHtml } from '../utils';

export interface PaymentRecoveredTemplateData {
  /** User's display name or email */
  userName: string;
  /** Amount that was successfully charged (in cents) */
  amountPaid: number;
  /** Currency code (e.g., 'usd') */
  currency: string;
  /** Plan name (e.g., 'Pro Monthly') */
  planName: string;
}

/**
 * Format amount for display
 */
function formatAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

/**
 * Generate the email subject line
 */
export function getPaymentRecoveredSubject(): string {
  return `Payment received - Your ${APP_NAME} Pro access is restored`;
}

/**
 * Generate plain text email body
 */
export function getPaymentRecoveredText(
  data: PaymentRecoveredTemplateData
): string {
  const { userName, amountPaid, currency, planName } = data;
  const dashboardUrl = getAppUrl('/');
  const amount = formatAmount(amountPaid, currency);

  return `Hi ${userName},

Great news! Your payment of ${amount} for ${planName} was successful.

Your Pro access has been fully restored. All your Pro features are available again:

✓ Branding removed from your profile
✓ Advanced analytics enabled
✓ Contact export available

Continue to your dashboard: ${dashboardUrl}

Thanks for being a ${APP_NAME} Pro member!

The ${APP_NAME} Team
`;
}

/**
 * Generate HTML email body
 */
export function getPaymentRecoveredHtml(
  data: PaymentRecoveredTemplateData
): string {
  const { userName, amountPaid, currency, planName } = data;
  const dashboardUrl = getAppUrl('/');
  const amount = formatAmount(amountPaid, currency);
  const safeName = escapeHtml(userName);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Received - ${APP_NAME}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">

  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #111827; font-size: 24px; font-weight: 700; margin: 0;">
      ${APP_NAME}
    </h1>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px;">

    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; background-color: #dcfce7; border-radius: 50%; width: 64px; height: 64px; line-height: 64px;">
        <span style="font-size: 32px;">✓</span>
      </div>
    </div>

    <h2 style="color: #111827; font-size: 20px; font-weight: 600; margin: 0 0 16px 0; text-align: center;">
      Payment Successful!
    </h2>

    <p style="margin: 0 0 16px 0;">
      Hi ${safeName},
    </p>

    <p style="margin: 0 0 16px 0;">
      Great news! Your payment of <strong>${amount}</strong> for <strong>${escapeHtml(planName)}</strong> was successful.
    </p>

    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="margin: 0 0 8px 0; font-weight: 600; color: #166534;">
        Your Pro access is fully restored:
      </p>
      <ul style="margin: 0; padding-left: 20px; color: #15803d;">
        <li>Branding removed from your profile</li>
        <li>Advanced analytics enabled</li>
        <li>Contact export available</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${dashboardUrl}"
         style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
        Go to Dashboard
      </a>
    </div>

    <p style="margin: 24px 0 0 0; color: #6b7280; text-align: center;">
      Thanks for being a ${APP_NAME} Pro member!
    </p>

  </div>

  <div style="text-align: center; margin-top: 32px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">
      © ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
    </p>
  </div>

</body>
</html>`;
}

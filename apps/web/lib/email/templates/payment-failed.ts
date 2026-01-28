/**
 * Payment Failed Email Template
 *
 * Sent to users when their subscription payment fails.
 * Part of the dunning and recovery sequence.
 */

import { APP_NAME } from '@/constants/app';
import { getAppUrl } from '@/constants/domains';
import { escapeHtml } from '../utils';

export interface PaymentFailedTemplateData {
  /** User's display name or email */
  userName: string;
  /** Amount that failed to charge (in cents) */
  amountDue: number;
  /** Currency code (e.g., 'usd') */
  currency: string;
  /** Number of payment attempts so far */
  attemptCount: number;
  /** Plan name (e.g., 'Pro Monthly') */
  planName: string;
  /** Invoice ID for reference */
  invoiceId: string;
  /** Stripe customer portal URL (for updating payment method) */
  portalUrl?: string;
  /** Days until subscription is cancelled (based on Stripe dunning settings) */
  daysRemaining?: number;
}

/**
 * Build the billing portal URL
 */
export function buildBillingUrl(): string {
  return getAppUrl('/app/billing');
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
 * Generate the email subject line based on attempt count
 */
export function getPaymentFailedSubject(
  data: PaymentFailedTemplateData
): string {
  const { attemptCount } = data;

  if (attemptCount === 1) {
    return `Action needed: Your ${APP_NAME} payment didn't go through`;
  }

  if (attemptCount === 2) {
    return `Second notice: Update your payment method for ${APP_NAME}`;
  }

  return `Final notice: Your ${APP_NAME} Pro access expires soon`;
}

/**
 * Generate plain text email body
 */
export function getPaymentFailedText(data: PaymentFailedTemplateData): string {
  const {
    userName,
    amountDue,
    currency,
    attemptCount,
    planName,
    daysRemaining,
  } = data;
  const billingUrl = buildBillingUrl();
  const amount = formatAmount(amountDue, currency);

  let urgencyMessage = '';
  if (attemptCount >= 3 || (daysRemaining && daysRemaining <= 3)) {
    urgencyMessage =
      '\n\n⚠️ This is your final notice. Your Pro access will be cancelled if payment is not received soon.';
  }

  const daysMessage = daysRemaining
    ? `\n\nYou have ${daysRemaining} days to update your payment method before your Pro access is cancelled.`
    : '';

  return `Hi ${userName},

We tried to charge ${amount} for your ${planName} subscription, but the payment didn't go through.${urgencyMessage}${daysMessage}

Please update your payment method to keep your Pro features:

${billingUrl}

What happens if you don't update:
- Your profile branding will be restored
- Advanced analytics will be unavailable
- Contact export will be disabled

If you have any questions, just reply to this email.

Thanks,
The ${APP_NAME} Team
`;
}

/**
 * Generate HTML email body
 */
export function getPaymentFailedHtml(data: PaymentFailedTemplateData): string {
  const {
    userName,
    amountDue,
    currency,
    attemptCount,
    planName,
    daysRemaining,
  } = data;
  const billingUrl = buildBillingUrl();
  const amount = formatAmount(amountDue, currency);
  const safeName = escapeHtml(userName);

  const urgencyBanner =
    attemptCount >= 3 || (daysRemaining && daysRemaining <= 3)
      ? `
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="color: #991b1b; margin: 0; font-weight: 600;">
        ⚠️ Final Notice: Your Pro access will be cancelled if payment is not received soon.
      </p>
    </div>
  `
      : '';

  const daysMessage = daysRemaining
    ? `<p style="color: #6b7280; font-size: 14px;">You have <strong>${daysRemaining} days</strong> to update your payment method.</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Failed - ${APP_NAME}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">

  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #111827; font-size: 24px; font-weight: 700; margin: 0;">
      ${APP_NAME}
    </h1>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px;">

    <h2 style="color: #111827; font-size: 20px; font-weight: 600; margin: 0 0 16px 0;">
      Payment didn't go through
    </h2>

    ${urgencyBanner}

    <p style="margin: 0 0 16px 0;">
      Hi ${safeName},
    </p>

    <p style="margin: 0 0 16px 0;">
      We tried to charge <strong>${amount}</strong> for your <strong>${escapeHtml(planName)}</strong> subscription, but the payment didn't go through.
    </p>

    ${daysMessage}

    <p style="margin: 0 0 24px 0;">
      Please update your payment method to keep your Pro features:
    </p>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${billingUrl}"
         style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
        Update Payment Method
      </a>
    </div>

    <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="margin: 0 0 8px 0; font-weight: 600; color: #374151;">
        What happens if you don't update:
      </p>
      <ul style="margin: 0; padding-left: 20px; color: #6b7280;">
        <li>Your profile branding will be restored</li>
        <li>Advanced analytics will be unavailable</li>
        <li>Contact export will be disabled</li>
      </ul>
    </div>

    <p style="margin: 24px 0 0 0; color: #6b7280;">
      If you have any questions, just reply to this email.
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

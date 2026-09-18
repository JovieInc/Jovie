/**
 * Paid Welcome / Fulfillment Confirmation Email
 *
 * Sent once after a verified paid subscription grants entitlement.
 * Confirms the purchased offer, activation, and how to get help.
 * JOV-6445 — gated by PAID_WELCOME_EMAIL (default off).
 */

import { APP_NAME } from '@/constants/app';
import { BASE_URL, SUPPORT_EMAIL, getAppUrl } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { escapeHtml } from '../utils';

export interface PaidWelcomeTemplateData {
  /** Safe first name only — omit for a generic greeting */
  firstName?: string | null;
  /** Purchased offer display name (e.g. "Pro") */
  offerName: string;
  /** Dashboard / activation URL */
  activationUrl?: string;
  /** Billing / recovery URL */
  billingUrl?: string;
  /** Support page URL */
  supportUrl?: string;
  /** Support inbox */
  supportEmail?: string;
}

export function buildPaidWelcomeActivationUrl(): string {
  return getAppUrl('/');
}

export function buildPaidWelcomeBillingUrl(): string {
  return getAppUrl('/settings/billing');
}

export function buildPaidWelcomeSupportUrl(): string {
  return `${BASE_URL}${APP_ROUTES.SUPPORT}`;
}

export function getPaidWelcomeSubject(data: PaidWelcomeTemplateData): string {
  return `Your ${APP_NAME} ${data.offerName} plan is active`;
}

export function getPaidWelcomeText(data: PaidWelcomeTemplateData): string {
  const greeting = data.firstName ? `Hey ${data.firstName},` : 'Hey,';
  const activationUrl = data.activationUrl ?? buildPaidWelcomeActivationUrl();
  const billingUrl = data.billingUrl ?? buildPaidWelcomeBillingUrl();
  const supportUrl = data.supportUrl ?? buildPaidWelcomeSupportUrl();
  const supportEmail = data.supportEmail ?? SUPPORT_EMAIL;

  return `${greeting}

Your ${data.offerName} subscription is confirmed and your ${APP_NAME} account is active.

Open ${APP_NAME}: ${activationUrl}

Manage billing or recover access: ${billingUrl}

Questions or stuck getting set up? Email ${supportEmail} or visit ${supportUrl}.

— ${APP_NAME}
`;
}

export function getPaidWelcomeHtml(data: PaidWelcomeTemplateData): string {
  const greeting = data.firstName
    ? `Hey ${escapeHtml(data.firstName)},`
    : 'Hey,';
  const offerName = escapeHtml(data.offerName);
  const activationUrl = data.activationUrl ?? buildPaidWelcomeActivationUrl();
  const billingUrl = data.billingUrl ?? buildPaidWelcomeBillingUrl();
  const supportUrl = data.supportUrl ?? buildPaidWelcomeSupportUrl();
  const supportEmail = data.supportEmail ?? SUPPORT_EMAIL;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your ${APP_NAME} ${offerName} plan is active</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">

  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #111827; font-size: 24px; font-weight: 700; margin: 0;">
      ${APP_NAME}
    </h1>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px;">
    <p style="margin: 0 0 16px 0;">${greeting}</p>
    <p style="margin: 0 0 16px 0;">
      Your <strong>${offerName}</strong> subscription is confirmed and your ${APP_NAME} account is active.
    </p>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${escapeHtml(activationUrl)}"
         style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
        Open ${APP_NAME}
      </a>
    </div>

    <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
      Manage billing or recover access:
      <a href="${escapeHtml(billingUrl)}" style="color: #4f46e5;">${escapeHtml(billingUrl)}</a>
    </p>
    <p style="margin: 0; color: #6b7280; font-size: 14px;">
      Questions or stuck getting set up? Email
      <a href="mailto:${escapeHtml(supportEmail)}" style="color: #4f46e5;">${escapeHtml(supportEmail)}</a>
      or visit
      <a href="${escapeHtml(supportUrl)}" style="color: #4f46e5;">${escapeHtml(supportUrl)}</a>.
    </p>
  </div>

  <div style="text-align: center; margin-top: 32px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">© ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
  </div>

</body>
</html>`;
}

export function getPaidWelcomeEmail(data: PaidWelcomeTemplateData) {
  return {
    subject: getPaidWelcomeSubject(data),
    text: getPaidWelcomeText(data),
    html: getPaidWelcomeHtml(data),
  };
}

/**
 * Price Change Notice Email
 *
 * Sent to every existing paid subscriber at least PRICE_CHANGE_NOTICE_DAYS
 * before a price increase applies. DRAFT COPY: Tim owns the final wording
 * (tracked in the price-change-notice PR). Bump TEMPLATE_VERSION when the
 * wording changes; the sent version and a content hash are stored per notice.
 */

import { createHash } from 'node:crypto';
import { APP_NAME } from '@/constants/app';
import { formatAmount } from '@/lib/utils/format-number';
import { escapeHtml } from '../utils';

export const PRICE_CHANGE_NOTICE_TEMPLATE_VERSION = 'v1-draft';

export interface PriceChangeNoticeTemplateData {
  userName: string;
  planName: string;
  oldAmountCents: number;
  newAmountCents: number;
  currency: string;
  /** UTC YYYY-MM-DD the new price first applies. */
  effectiveDate: string;
  /** Where the subscriber cancels or manages billing. */
  manageUrl: string;
}

export function formatEffectiveDate(day: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${day}T00:00:00.000Z`));
}

export function getPriceChangeNoticeSubject(
  data: PriceChangeNoticeTemplateData
): string {
  return `Your ${APP_NAME} ${data.planName} price is changing on ${formatEffectiveDate(data.effectiveDate)}`;
}

function lines(data: PriceChangeNoticeTemplateData) {
  const oldPrice = formatAmount(data.oldAmountCents, data.currency);
  const newPrice = formatAmount(data.newAmountCents, data.currency);
  const date = formatEffectiveDate(data.effectiveDate);
  return { oldPrice, newPrice, date };
}

export function getPriceChangeNoticeText(
  data: PriceChangeNoticeTemplateData
): string {
  const { oldPrice, newPrice, date } = lines(data);
  return `Hi ${data.userName},

The price of your ${data.planName} plan is changing from ${oldPrice} to ${newPrice} per month. The new price applies to renewals on or after ${date}. Until then you keep paying ${oldPrice}.

You do not need to do anything to keep your plan at the new price.

If you would rather not continue, you can cancel before ${date} and you will not be charged the new price. Cancellation takes effect at the end of your current billing period and you keep access until then.

Manage or cancel your plan: ${data.manageUrl}

Questions? Reply to this email.

Thanks,
The ${APP_NAME} Team
`;
}

export function getPriceChangeNoticeHtml(
  data: PriceChangeNoticeTemplateData
): string {
  const { oldPrice, newPrice, date } = lines(data);
  const name = escapeHtml(data.userName);
  const plan = escapeHtml(data.planName);
  const url = escapeHtml(data.manageUrl);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your ${APP_NAME} price is changing</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #111827; font-size: 22px; font-weight: 700; margin: 0 0 24px 0;">${APP_NAME}</h1>
  <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px;">
    <h2 style="color: #111827; font-size: 20px; font-weight: 600; margin: 0 0 16px 0;">Your ${plan} price is changing</h2>
    <p style="margin: 0 0 16px 0;">Hi ${name},</p>
    <p style="margin: 0 0 16px 0;">The price of your <strong>${plan}</strong> plan is changing from <strong>${oldPrice}</strong> to <strong>${newPrice}</strong> per month. The new price applies to renewals on or after <strong>${date}</strong>. Until then you keep paying ${oldPrice}.</p>
    <p style="margin: 0 0 16px 0;">You do not need to do anything to keep your plan at the new price.</p>
    <p style="margin: 0 0 24px 0;">If you would rather not continue, you can cancel before ${date} and you will not be charged the new price. Cancellation takes effect at the end of your current billing period and you keep access until then.</p>
    <p style="margin: 0 0 24px 0;"><a href="${url}" style="display: inline-block; background-color: #111827; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Manage or cancel your plan</a></p>
    <p style="margin: 0; color: #6b7280; font-size: 14px;">Questions? Reply to this email.</p>
  </div>
</body>
</html>`;
}

/** Hash of the exact text that was sent, kept as delivery evidence. */
export function hashNoticeContent(subject: string, text: string): string {
  return createHash('sha256').update(`${subject}\n${text}`).digest('hex');
}

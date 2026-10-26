import 'server-only';

import { eq, or } from 'drizzle-orm';
import { BASE_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  getPriceChangeNoticeHtml,
  getPriceChangeNoticeSubject,
  getPriceChangeNoticeText,
  hashNoticeContent,
  PRICE_CHANGE_NOTICE_TEMPLATE_VERSION,
} from '@/lib/email/templates/price-change-notice';
import { captureCriticalError } from '@/lib/error-tracking';
import { ResendEmailProvider } from '@/lib/notifications/providers/resend';
import type { IncidentPort, MailPort, Recipient, RecipientPort } from './ports';
import type { BuildNoticeInput, BuiltNotice } from './sweep';

let provider: ResendEmailProvider | null = null;

export const resendMailPort: MailPort = {
  async send(message) {
    provider ??= new ResendEmailProvider();
    const result = await provider.sendEmail({
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      idempotencyKey: message.idempotencyKey,
    });
    if (
      result.status === 'sent' &&
      result.detail &&
      result.detail !== 'resend'
    ) {
      return { status: 'sent', messageId: result.detail };
    }
    return {
      status:
        result.status === 'sent'
          ? 'error'
          : result.status === 'skipped'
            ? 'skipped'
            : 'error',
      detail: result.detail ?? result.status,
    };
  },
};

export const dbRecipientPort: RecipientPort = {
  async resolve(subscription): Promise<Recipient | null> {
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(
        or(
          eq(users.stripeSubscriptionId, subscription.subscriptionId),
          eq(users.stripeCustomerId, subscription.customerId)
        )
      )
      .limit(1);
    const email = user?.email ?? subscription.customerEmail;
    if (!email) return null;
    return {
      userId: user?.id ?? null,
      email,
      name: user?.name || email.split('@')[0] || 'there',
    };
  },
};

export const sentryIncidentPort: IncidentPort = {
  async raise(incident) {
    await captureCriticalError(incident.summary, new Error(incident.summary), {
      route: 'price-change-sweep',
      changeId: incident.changeId,
      missingCount: incident.missing.length,
      // Subscription ids only; never addresses.
      missing: incident.missing.slice(0, 50),
      reasons: incident.reasons,
    });
  },
};

export function buildPriceChangeNotice(input: BuildNoticeInput): BuiltNotice {
  const data = {
    userName: input.userName,
    planName: input.change.planName,
    oldAmountCents: input.change.oldAmountCents,
    newAmountCents: input.change.newAmountCents,
    currency: input.change.currency,
    effectiveDate: input.change.effectiveDate,
    manageUrl: `${BASE_URL}${APP_ROUTES.SETTINGS_BILLING}`,
  };
  const subject = getPriceChangeNoticeSubject(data);
  const text = getPriceChangeNoticeText(data);
  return {
    subject,
    text,
    html: getPriceChangeNoticeHtml(data),
    contentHash: hashNoticeContent(subject, text),
    templateVersion: PRICE_CHANGE_NOTICE_TEMPLATE_VERSION,
  };
}

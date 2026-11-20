import { lintCopy } from '@jovie/copy';
import { LEGAL_ENTITY_NAME } from '@/constants/app';
import { BASE_URL } from '@/constants/domains';
import { buildClickTrackingUrl } from '@/lib/email/tracking';
import { generateUnsubscribeToken } from '@/lib/email/unsubscribe-token';
import { getSenderPolicy } from '@/lib/notifications/sender-policy';
import type { KnownBadFlowFix } from './registry';

export interface RecoveryEmailInput {
  readonly fix: KnownBadFlowFix;
  readonly firstName: string | null;
  readonly email: string;
  readonly readyUrl: string;
  /** Ledger record id (uuid): the tracking reference. */
  readonly recordId: string;
  /** Operator-supplied postal address. Required to send. */
  readonly mailingAddress: string | null;
}

export interface RecoveryEmail {
  readonly subject: string;
  readonly text: string;
  readonly headers: Record<string, string>;
  readonly replyTo: string;
  readonly from: string;
}

export const RECOVERY_SUBJECT = 'A hiccup when you signed up';

/** First name only when it is a plain name; otherwise no greeting name. */
function greetingName(firstName: string | null): string | null {
  const name = firstName?.trim().split(/\s+/u)[0] ?? '';
  return /^[\p{L}][\p{L}'.-]{0,29}$/u.test(name) ? name : null;
}

/** Body without footer: this is what Tim sees on the approval card. */
export function buildRecoveryBody(
  input: Pick<RecoveryEmailInput, 'fix' | 'firstName'>,
  link: string
): string {
  const name = greetingName(input.firstName);
  return [
    name ? `Hey ${name},` : 'Hey,',
    '',
    `I'm Tim, I run Jovie. When you signed up, ${input.fix.whatBroke}. That was on us. It's fixed: ${input.fix.whatChanged}.`,
    '',
    `Here's where you left off: ${link}`,
    '',
    'If anything still looks off, reply and tell me. I read every reply.',
    '',
    'Tim',
  ].join('\n');
}

export function buildUnsubscribeUrl(email: string): string | null {
  const token = generateUnsubscribeToken(email);
  return token
    ? `${BASE_URL}/api/unsubscribe/recovery?token=${encodeURIComponent(token)}`
    : null;
}

export class RecoveryEmailBlocked extends Error {}

/** Throws RecoveryEmailBlocked when the email cannot go out compliantly. */
export function buildRecoveryEmail(input: RecoveryEmailInput): RecoveryEmail {
  if (!input.mailingAddress?.trim()) {
    throw new RecoveryEmailBlocked('mailing_address_missing');
  }
  const unsubscribeUrl = buildUnsubscribeUrl(input.email);
  if (!unsubscribeUrl)
    throw new RecoveryEmailBlocked('unsubscribe_unavailable');

  const link =
    buildClickTrackingUrl(
      {
        emailType: 'recovery',
        referenceId: input.recordId,
        email: input.email,
      },
      input.readyUrl,
      'ready'
    ) ?? input.readyUrl;

  const body = buildRecoveryBody(input, link);
  const lint = lintCopy(body, { register: 'founder-tim' });
  if (!lint.ok) {
    throw new RecoveryEmailBlocked('copy_lint_blocked');
  }

  const text = `${body}\n\n--\n${LEGAL_ENTITY_NAME}, ${input.mailingAddress.trim()}\nNot useful? Unsubscribe: ${unsubscribeUrl}`;
  const policy = getSenderPolicy('founder');
  return {
    subject: RECOVERY_SUBJECT,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    replyTo: policy.replyToEmail,
    from: `Tim White <${policy.fromEmail}>`,
  };
}

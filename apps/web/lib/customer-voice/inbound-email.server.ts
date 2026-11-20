import 'server-only';

import { normalizeEmail } from '@/lib/utils/email';
import { runAfterResponse } from './after-response';
import { captureCustomerVoice } from './capture.server';

/**
 * Local parts of the inbound domain that are Jovie, not an artist. All are
 * reserved usernames (lib/validation/username-core.ts), so they can never
 * shadow an artist inbox.
 */
export const CUSTOMER_VOICE_EMAIL_LOCAL_PARTS: ReadonlySet<string> = new Set([
  'support',
  'help',
  'team',
  'contact',
]);

/** Pull a bare address out of `Name <a@b>` or return the input. */
export function bareAddress(from: string): string {
  const match = /<([^>]+)>/u.exec(from);
  return normalizeEmail((match?.[1] ?? from).trim());
}

/**
 * Store and hand off after the webhook has answered, so Summer drafting
 * never holds the provider's request open.
 */
export async function captureInboundSupportEmail(input: {
  readonly from: string;
  readonly fromName: string | null;
  readonly subject: string | null;
  readonly messageId: string | null;
  readonly text: string;
  readonly localPart: string;
}): Promise<void> {
  const receivedAt = new Date();
  const address = bareAddress(input.from);
  runAfterResponse(async () => {
    await captureCustomerVoice({
      channel: 'email',
      text: input.text,
      receivedAt,
      replyTo: address,
      fromName: input.fromName,
      subject: input.subject,
      inReplyTo: input.messageId,
      surface: `${input.localPart}@ email`,
    });
  });
}

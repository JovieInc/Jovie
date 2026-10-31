/**
 * The one place in the app that talks to Resend. Only the send gateway calls
 * it; scripts/lib/external-api-guard.mjs fails CI on a Resend import or an
 * api.resend.com call anywhere else.
 */
import { Resend } from 'resend';
import { env } from '@/lib/env-server';
import type { PreparedEmail } from './policy';
import {
  exhaustedQuota,
  QUOTA_ERROR_NAMES,
  type QuotaReading,
  quotaLimitsFor,
  readQuota,
} from './quota';

export type TransportResult =
  | {
      readonly ok: true;
      readonly messageId: string | null;
      readonly quota?: QuotaReading | null;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly quota?: QuotaReading | null;
    };

export interface EmailTransport {
  readonly name: 'resend';
  configured(): boolean;
  send(email: PreparedEmail): Promise<TransportResult>;
}

let client: Resend | null = null;

function getClient(): Resend {
  client ??= new Resend(env.RESEND_API_KEY ?? '');
  return client;
}

export const resendTransport: EmailTransport = {
  name: 'resend',
  configured: () => Boolean(env.RESEND_API_KEY),
  async send(email) {
    const request = {
      from: email.from,
      to: [email.to],
      ...(email.cc.length > 0 && { cc: [...email.cc] }),
      subject: email.subject,
      text: email.text,
      ...(email.html !== undefined && { html: email.html }),
      ...(email.replyTo && { replyTo: email.replyTo }),
      headers: { ...email.headers },
      tags: email.tags.map(tag => ({ ...tag })),
      ...(email.attachments.length > 0 && {
        attachments: email.attachments.map(attachment => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        })),
      }),
    };
    try {
      const response = email.idempotencyKey
        ? await getClient().emails.send(request, {
            idempotencyKey: email.idempotencyKey,
          })
        : await getClient().emails.send(request);
      const limits = quotaLimitsFor('resend');
      const quota =
        response.error && QUOTA_ERROR_NAMES.has(response.error.name)
          ? exhaustedQuota(limits)
          : readQuota(response.headers, limits);
      if (response.error) {
        return { ok: false, error: response.error.message, quota };
      }
      return { ok: true, messageId: response.data?.id ?? null, quota };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown Resend error',
      };
    }
  },
};

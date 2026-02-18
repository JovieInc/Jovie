import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';
import {
  extractPayloadProps,
  inferChannel,
  trackServerError,
  trackUnsubscribeAttempt,
  trackUnsubscribeError,
  trackUnsubscribeSuccess,
} from '@/lib/notifications/analytics';
import {
  buildMissingIdentifierResponse,
  buildServerErrorResponse,
  buildUnsubscribeSuccessResponse,
  buildValidationErrorResponse,
  type NotificationDomainResponse,
} from '@/lib/notifications/response';
import {
  normalizeSubscriptionEmail,
  normalizeSubscriptionPhone,
} from '@/lib/notifications/validation';
import { unsubscribeSchema } from '@/lib/validation/schemas';
import type {
  NotificationChannel,
  NotificationUnsubscribeResponse,
} from '@/types/notifications';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** Matches C0 control characters (U+0000-U+001F) and DEL (U+007F) using Unicode property escapes */
const CONTROL_CHAR_REGEX = /\p{Cc}/gu;

const getHeader = (headers: Headers | undefined, key: string) =>
  headers?.get(key) ?? null;

const _getForwardedIp = (headers?: Headers) =>
  getHeader(headers, 'x-forwarded-for')?.split(',')[0]?.trim() || null;

const _sanitizeCity = (raw: string | null | undefined) => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = trimmed
    .replaceAll(CONTROL_CHAR_REGEX, '')
    .replaceAll(/\s+/g, ' ');
  return cleaned || null;
};

const _sanitizeCountryCode = (raw: string | null | undefined) => {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 2).toUpperCase();
  const normalized = trimmed.replaceAll(/[^A-Z]/g, '');
  return normalized.length === 2 ? normalized : null;
};

async function validateUnsubscribeIdentifiers(
  email: string | undefined,
  phone: string | undefined,
  token: string | undefined,
  artist_id: string,
  method: string | undefined,
  channel: NotificationChannel | undefined
): Promise<
  | {
      normalizedEmail: string | null;
      normalizedPhone: string | null;
      targetChannel: NotificationChannel;
    }
  | NotificationDomainResponse<NotificationUnsubscribeResponse>
> {
  if (!email && !phone && !token) {
    const targetChannel = channel || (phone ? 'sms' : 'email');
    await trackUnsubscribeError({
      artist_id,
      error_type: 'missing_identifier',
      method,
      channel: targetChannel,
    });
    return buildMissingIdentifierResponse(
      'Either email, phone, or token must be provided'
    );
  }

  const normalizedEmail = normalizeSubscriptionEmail(email) ?? null;
  const normalizedPhone = normalizeSubscriptionPhone(phone) ?? null;

  if (phone && !normalizedPhone) {
    const targetChannel = channel || 'sms';
    await trackUnsubscribeError({
      artist_id,
      error_type: 'validation_error',
      validation_errors: ['Invalid phone number'],
      channel: targetChannel,
    });
    return buildValidationErrorResponse('Please provide a valid phone number');
  }

  const targetChannel: NotificationChannel =
    channel || (normalizedPhone ? 'sms' : 'email');

  if (!normalizedEmail && !normalizedPhone) {
    await trackUnsubscribeError({
      artist_id,
      error_type: 'missing_identifier',
      method,
      channel: targetChannel,
    });
    return buildMissingIdentifierResponse('Contact required to unsubscribe');
  }

  return { normalizedEmail, normalizedPhone, targetChannel };
}

export const unsubscribeFromNotificationsDomain = async (
  payload: unknown
): Promise<NotificationDomainResponse<NotificationUnsubscribeResponse>> => {
  const bodyObject = isRecord(payload) ? payload : {};

  try {
    const result = unsubscribeSchema.safeParse(payload);

    await trackUnsubscribeAttempt(bodyObject);

    if (!result.success) {
      const props = extractPayloadProps(bodyObject);
      await trackUnsubscribeError({
        artist_id: props.artist_id,
        error_type: 'validation_error',
        validation_errors: result.error.format()._errors,
        channel: inferChannel(bodyObject),
      });
      return buildValidationErrorResponse('Invalid request data');
    }

    const { artist_id, email, phone, token, method, channel } = result.data;

    const validation = await validateUnsubscribeIdentifiers(
      email,
      phone,
      token,
      artist_id,
      method,
      channel
    );

    if ('status' in validation) {
      return validation;
    }

    const { normalizedEmail, normalizedPhone, targetChannel } = validation;

    const whereClauses = [
      eq(notificationSubscriptions.creatorProfileId, artist_id),
    ];

    if (targetChannel === 'email' && normalizedEmail) {
      whereClauses.push(
        eq(notificationSubscriptions.email, normalizedEmail),
        eq(notificationSubscriptions.channel, 'email')
      );
    } else if (targetChannel === 'sms' && normalizedPhone) {
      whereClauses.push(
        eq(notificationSubscriptions.phone, normalizedPhone),
        eq(notificationSubscriptions.channel, 'sms')
      );
    }

    const deleted = await db
      .delete(notificationSubscriptions)
      .where(and(...whereClauses))
      .returning({ id: notificationSubscriptions.id });

    await trackUnsubscribeSuccess({
      artist_id,
      method,
      channel: targetChannel,
    });

    return buildUnsubscribeSuccessResponse(deleted.length);
  } catch (error) {
    await trackServerError('unsubscribe', error);
    captureError('Notifications Unsubscribe Domain Error', error);
    return buildServerErrorResponse();
  }
};

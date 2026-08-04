/**
 * Dependency-light validation for notification capture fields rendered on
 * public profiles. Server request schemas wrap this logic with Zod.
 */

const EMAIL_MAX_LENGTH = 254;
const PHONE_MAX_LENGTH = 32;
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/; // NOSONAR (S5852) - bounded by EMAIL_MAX_LENGTH before regex use
const CONTROL_OR_SPACE_REGEX = /[\s\p{Cc}]/u;
const E164_PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

export const NOTIFICATION_CAPTURE_ERROR_MESSAGES = {
  emailRequired: 'Email address is required.',
  emailTooLong: 'Email address must be 254 characters or fewer.',
  emailNoSpaces: 'Email address cannot contain spaces or control characters.',
  emailFormat:
    'Email address must include a local part, @, domain, and top-level domain.',
  phoneRequired: 'Phone number is required.',
  phoneTooLong: 'Phone number must be 32 characters or fewer.',
  phoneFormat: 'Phone number must be a valid US or Canadian number.',
  smsCountry: 'SMS notifications are available in the US and Canada only.',
} as const;

export interface NotificationCaptureInput {
  readonly channel: 'email' | 'sms';
  readonly value: string;
  readonly country_code?: string;
}

export interface NotificationCaptureIssue {
  readonly message: string;
  readonly path: 'value' | 'country_code';
}

export function getNotificationCaptureIssue(
  input: NotificationCaptureInput
): NotificationCaptureIssue | null {
  if (input.channel === 'email') {
    const trimmed = input.value.trim();

    if (!trimmed) {
      return {
        message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.emailRequired,
        path: 'value',
      };
    }

    if (trimmed.length > EMAIL_MAX_LENGTH) {
      return {
        message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.emailTooLong,
        path: 'value',
      };
    }

    if (CONTROL_OR_SPACE_REGEX.test(trimmed)) {
      return {
        message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.emailNoSpaces,
        path: 'value',
      };
    }

    return EMAIL_REGEX.test(trimmed)
      ? null
      : {
          message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.emailFormat,
          path: 'value',
        };
  }

  const countryCode = input.country_code?.toUpperCase();
  if (countryCode !== 'US' && countryCode !== 'CA') {
    return {
      message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.smsCountry,
      path: 'country_code',
    };
  }

  const trimmed = input.value.trim();
  if (!trimmed) {
    return {
      message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.phoneRequired,
      path: 'value',
    };
  }

  if (trimmed.length > PHONE_MAX_LENGTH) {
    return {
      message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.phoneTooLong,
      path: 'value',
    };
  }

  return E164_PHONE_REGEX.test(trimmed)
    ? null
    : {
        message: NOTIFICATION_CAPTURE_ERROR_MESSAGES.phoneFormat,
        path: 'value',
      };
}

export function getNotificationCaptureError(
  input: NotificationCaptureInput
): string | null {
  return getNotificationCaptureIssue(input)?.message ?? null;
}

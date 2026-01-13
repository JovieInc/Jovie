import {
  type CountryCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
} from 'libphonenumber-js';

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const EMAIL_MAX_LENGTH = 254;
const PHONE_MAX_LENGTH = 32;

const CONTROL_OR_SPACE_REGEX = /[\s\u0000-\u001F\u007F]/g;

export function normalizeSubscriptionEmail(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > EMAIL_MAX_LENGTH) return null;
  if (CONTROL_OR_SPACE_REGEX.test(trimmed)) return null;
  if (!EMAIL_REGEX.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/**
 * Normalize and validate phone number using libphonenumber-js.
 * Returns E.164 format (+1234567890) or null if invalid.
 *
 * @param raw - Raw phone input
 * @param defaultCountry - Default country code for numbers without country code (default: US)
 */
export function normalizeSubscriptionPhone(
  raw: string | null | undefined,
  defaultCountry: CountryCode = 'US'
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > PHONE_MAX_LENGTH) return null;

  try {
    const phoneNumber = parsePhoneNumberFromString(trimmed, defaultCountry);

    if (!phoneNumber) {
      return null;
    }

    if (!phoneNumber.isValid()) {
      return null;
    }

    return phoneNumber.format('E.164');
  } catch {
    return null;
  }
}

/**
 * Check if a phone number is valid without normalizing.
 *
 * @param phone - Phone number to validate
 * @param defaultCountry - Default country code (default: US)
 */
export function isValidPhone(
  phone: string | null | undefined,
  defaultCountry: CountryCode = 'US'
): boolean {
  if (!phone) return false;
  const trimmed = phone.trim();
  if (!trimmed) return false;

  try {
    return isValidPhoneNumber(trimmed, defaultCountry);
  } catch {
    return false;
  }
}

/**
 * Parse phone number and return detailed info.
 */
export function parsePhone(
  phone: string | null | undefined,
  defaultCountry: CountryCode = 'US'
) {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;

  try {
    const phoneNumber = parsePhoneNumberFromString(trimmed, defaultCountry);
    if (!phoneNumber || !phoneNumber.isValid()) {
      return null;
    }

    return {
      e164: phoneNumber.format('E.164'),
      national: phoneNumber.formatNational(),
      international: phoneNumber.formatInternational(),
      country: phoneNumber.country,
      countryCallingCode: phoneNumber.countryCallingCode,
      nationalNumber: phoneNumber.nationalNumber,
      type: phoneNumber.getType(),
    };
  } catch {
    return null;
  }
}

/**
 * Plain (no `server-only` guard) SMS consent constants safe to import from
 * client components. The full snapshot/hash helpers stay in `sms-consent.ts`
 * because they pull in `node:crypto`.
 */
export const SMS_CONSENT_VERSION = 'v1';

export const SMS_CONSENT_TEXT =
  'By texting Jovie, you agree to receive release alerts from this artist. Msg & data rates may apply. Reply STOP to opt out.';

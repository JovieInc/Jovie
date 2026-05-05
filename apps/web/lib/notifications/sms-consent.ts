import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Versioned SMS consent disclosure shown before any native handoff.
 *
 * Bump the version (and update SMS_CONSENT_TEXT) any time the language
 * changes. The version + hash are persisted on `notification_contacts`
 * (global first-write-wins) and on `notification_subscriptions` (per-artist)
 * to preserve TCPA audit trail across multi-artist races.
 */
export const SMS_CONSENT_VERSION = 'v1';

export const SMS_CONSENT_TEXT =
  'By texting Jovie, you agree to receive release alerts from this artist. Msg & data rates may apply. Reply STOP to opt out.';

const CONSENT_TEXT_HASH = createHash('sha256')
  .update(SMS_CONSENT_TEXT, 'utf8')
  .digest('hex');

export function getSmsConsentTextHash(): string {
  return CONSENT_TEXT_HASH;
}

/**
 * Hash the consent text so we can detect drift between client-rendered copy
 * and persisted server consent. The hash is stable across builds and not
 * keyed by any secret — anyone who reads the consent line can compute it.
 */
export function hashConsentText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export interface ConsentSnapshot {
  version: string;
  textHash: string;
  text: string;
}

export function getCurrentConsentSnapshot(): ConsentSnapshot {
  return {
    version: SMS_CONSENT_VERSION,
    textHash: CONSENT_TEXT_HASH,
    text: SMS_CONSENT_TEXT,
  };
}

import 'server-only';
import { createHash } from 'node:crypto';
import { SMS_CONSENT_TEXT, SMS_CONSENT_VERSION } from './sms-consent-shared';

/**
 * Versioned SMS consent disclosure shown before any native handoff.
 *
 * Bump the version (and update `SMS_CONSENT_TEXT` in `sms-consent-shared.ts`)
 * any time the language changes. The version + hash are persisted on
 * `notification_contacts` (global first-write-wins) and on
 * `notification_subscriptions` (per-artist) to preserve TCPA audit trail
 * across multi-artist races.
 *
 * Re-export the plain constants here so existing server callers don't have
 * to switch import paths.
 */
export { SMS_CONSENT_TEXT, SMS_CONSENT_VERSION } from './sms-consent-shared';

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

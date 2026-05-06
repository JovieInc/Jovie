import { describe, expect, it } from 'vitest';

import {
  getCurrentConsentSnapshot,
  getSmsConsentTextHash,
  hashConsentText,
  SMS_CONSENT_TEXT,
  SMS_CONSENT_VERSION,
} from '@/lib/notifications/sms-consent';

describe('SMS consent snapshot', () => {
  it('exposes a non-empty consent text', () => {
    expect(SMS_CONSENT_TEXT).toMatch(/STOP/i);
    expect(SMS_CONSENT_TEXT).toMatch(/Jovie/i);
  });

  it('exposes a version', () => {
    expect(SMS_CONSENT_VERSION).toMatch(/^v\d+$/);
  });

  it('hashes deterministically', () => {
    const a = hashConsentText(SMS_CONSENT_TEXT);
    const b = hashConsentText(SMS_CONSENT_TEXT);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('getSmsConsentTextHash matches the SMS_CONSENT_TEXT hash', () => {
    expect(getSmsConsentTextHash()).toBe(hashConsentText(SMS_CONSENT_TEXT));
  });

  it('getCurrentConsentSnapshot returns a frozen-shape record', () => {
    const snap = getCurrentConsentSnapshot();
    expect(snap.text).toBe(SMS_CONSENT_TEXT);
    expect(snap.version).toBe(SMS_CONSENT_VERSION);
    expect(snap.textHash).toBe(getSmsConsentTextHash());
  });
});

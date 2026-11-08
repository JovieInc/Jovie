// Mock for @/lib/cookies/consent. The real module is a server action that
// writes the consent cookie through next/headers, which Storybook stubs, so
// every save silently succeeded and the cookie surfaces could never show
// their saving, failed or offline states. A story picks the outcome with
// setStorybookConsentSave and restores the default ('saved') on cleanup.
import type { Consent } from '@/lib/cookies/consent';

export type { Consent } from '@/lib/cookies/consent';

export type StorybookConsentSaveOutcome =
  | 'saved'
  | 'pending'
  | 'error'
  | 'offline';

let outcome: StorybookConsentSaveOutcome = 'saved';

/** Sets how the next saveConsent calls settle; returns a restore function. */
export function setStorybookConsentSave(
  next: StorybookConsentSaveOutcome
): () => void {
  const previous = outcome;
  outcome = next;
  return () => {
    outcome = previous;
  };
}

export async function readConsent(): Promise<Consent | null> {
  return null;
}

export async function saveConsent(_consent: Consent): Promise<void> {
  if (outcome === 'pending') return new Promise<void>(() => {});
  if (outcome === 'offline') throw new TypeError('Failed to fetch');
  if (outcome === 'error') throw new Error('Consent cookie write failed');
}

/**
 * Makes reading the stored consent choice (localStorage 'jv_cc') throw a
 * SecurityError, as a browser that blocks site storage does. Other keys keep
 * working so the preview's own storage is unaffected. Returns a restore
 * function for story cleanup.
 */
export function blockStoredConsentRead(): () => void {
  const original = Storage.prototype.getItem;
  Storage.prototype.getItem = function getItem(this: Storage, key: string) {
    if (key === 'jv_cc')
      throw new DOMException('The operation is insecure.', 'SecurityError');
    return original.call(this, key);
  };
  return () => {
    Storage.prototype.getItem = original;
  };
}

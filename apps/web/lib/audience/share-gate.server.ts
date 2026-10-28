/**
 * Server-only loader for the Level-2 share gate (see share-gate.ts).
 * Loads every subscription row, including revoked and unsubscribed ones, for
 * the given identifiers so consent can be resolved per person.
 */
import type { db } from '@/lib/db';
import { selectShareConsentRows } from '@/lib/notifications/domain';
import {
  NO_SHARED_CONTACT_KEYS,
  normalizeShareEmail,
  normalizeSharePhone,
  resolveShareKeys,
  type SharedContactKeys,
  type ShareGateContact,
} from './share-gate';

type SelectDb = Pick<typeof db, 'select'>;

export async function loadSharedContactKeys(
  tx: SelectDb,
  creatorProfileId: string,
  rows: readonly Pick<ShareGateContact, 'email' | 'phone'>[]
): Promise<SharedContactKeys> {
  const emails = [
    ...new Set(
      rows.flatMap(r => (r.email ? [normalizeShareEmail(r.email)] : []))
    ),
  ];
  const phones = [
    ...new Set(
      rows.flatMap(r => (r.phone ? [normalizeSharePhone(r.phone)] : []))
    ),
  ];
  if (emails.length === 0 && phones.length === 0) return NO_SHARED_CONTACT_KEYS;
  return resolveShareKeys(
    await selectShareConsentRows(tx, creatorProfileId, emails, phones)
  );
}

/**
 * Server-only loader for the Level-2 share gate (see share-gate.ts).
 * Loads every subscription row, including revoked and unsubscribed ones, for
 * the given identifiers so consent can be resolved per person.
 */
import { and, sql as drizzleSql, inArray, or } from 'drizzle-orm';
import type { db } from '@/lib/db';
import { notificationSubscriptions as subscriptions } from '@/lib/db/schema/analytics';
import {
  NO_SHARED_CONTACT_KEYS,
  normalizeShareEmail,
  normalizeSharePhone,
  resolveShareKeys,
  type SharedContactKeys,
  type ShareGateContact,
} from './share-gate';

type SelectDb = Pick<typeof db, 'select'>;

/** Load every subscription row (including revoked) for the given identifiers and resolve per person. */
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

  const match = [
    emails.length
      ? inArray(drizzleSql<string>`lower(trim(${subscriptions.email}))`, emails)
      : undefined,
    phones.length
      ? inArray(drizzleSql<string>`trim(${subscriptions.phone})`, phones)
      : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  const subs = await tx
    .select({
      email: subscriptions.email,
      phone: subscriptions.phone,
      optInAt: subscriptions.artistEmailOptInAt,
      optOutAt: subscriptions.artistEmailOptOutAt,
      unsubscribedAt: subscriptions.unsubscribedAt,
    })
    .from(subscriptions)
    .where(
      and(
        drizzleSql`${subscriptions.creatorProfileId} = ${creatorProfileId}`,
        or(...match)
      )
    );

  return resolveShareKeys(subs);
}

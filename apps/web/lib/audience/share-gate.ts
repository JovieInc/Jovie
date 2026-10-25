/**
 * Level-2 'share with artist' gate for audience contact details.
 *
 * Level 1 (Jovie sends): anyone who subscribes receives verified events from
 * Jovie; the artist never sees their email or phone.
 * Level 2 (share with artist): only an explicit share opt-in
 * (notification_subscriptions.artist_email_opt_in_at, not revoked, not
 * unsubscribed) unlocks artist-visible contact details, and with them artist
 * messaging, export, vCard and ad targeting.
 *
 * Every audience surface that returns or exports email/phone must go through
 * this module. The pure helpers are shared by server routes and client code.
 */
import {
  and,
  sql as drizzleSql,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
} from 'drizzle-orm';
import type { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { isArtistEmailOptedIn } from '@/lib/notifications/artist-email';

export interface ShareGateContact {
  email: string | null;
  phone: string | null;
  emailVisibleToArtist?: boolean;
}

export interface SharedContactKeys {
  readonly emails: ReadonlySet<string>;
  readonly phones: ReadonlySet<string>;
}

export const NO_SHARED_CONTACT_KEYS: SharedContactKeys = {
  emails: new Set(),
  phones: new Set(),
};

export function isSharedWithArtist(
  optInAt: Date | string | null | undefined,
  optOutAt: Date | string | null | undefined,
  unsubscribedAt?: Date | string | null
): boolean {
  if (unsubscribedAt) return false;
  return isArtistEmailOptedIn(optInAt, optOutAt);
}

/** Server: drop email/phone unless the person shared with this artist. */
export function applyShareGate<T extends ShareGateContact>(
  rows: readonly T[],
  keys: SharedContactKeys
): T[] {
  return rows.map(row => {
    const shared =
      (row.email != null && keys.emails.has(row.email.trim().toLowerCase())) ||
      (row.phone != null && keys.phones.has(row.phone.trim()));
    return shared
      ? { ...row, emailVisibleToArtist: true }
      : { ...row, email: null, phone: null, emailVisibleToArtist: false };
  });
}

/** Client defense in depth: may this row leave the app (CSV, vCard, copy)? */
export function canShareContactOut(
  row: Pick<ShareGateContact, 'emailVisibleToArtist'>
): boolean {
  return row.emailVisibleToArtist !== false;
}

/** Client: strip contact details from a row that is not shared. */
export function redactUnsharedContact<T extends ShareGateContact>(row: T): T {
  return canShareContactOut(row) ? row : { ...row, email: null, phone: null };
}

type SelectDb = Pick<typeof db, 'select'>;

/** Load the emails/phones that have an active share-with-artist opt-in. */
export async function loadSharedContactKeys(
  tx: SelectDb,
  creatorProfileId: string,
  rows: readonly Pick<ShareGateContact, 'email' | 'phone'>[]
): Promise<SharedContactKeys> {
  const emails = [
    ...new Set(
      rows.flatMap(r => (r.email ? [r.email.trim().toLowerCase()] : []))
    ),
  ];
  const phones = [
    ...new Set(rows.flatMap(r => (r.phone ? [r.phone.trim()] : []))),
  ];
  if (emails.length === 0 && phones.length === 0) return NO_SHARED_CONTACT_KEYS;

  const match = [
    emails.length
      ? inArray(
          drizzleSql<string>`lower(${notificationSubscriptions.email})`,
          emails
        )
      : undefined,
    phones.length
      ? inArray(notificationSubscriptions.phone, phones)
      : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  const subs = await tx
    .select({
      email: notificationSubscriptions.email,
      phone: notificationSubscriptions.phone,
      optInAt: notificationSubscriptions.artistEmailOptInAt,
      optOutAt: notificationSubscriptions.artistEmailOptOutAt,
      unsubscribedAt: notificationSubscriptions.unsubscribedAt,
    })
    .from(notificationSubscriptions)
    .where(
      and(
        eq(notificationSubscriptions.creatorProfileId, creatorProfileId),
        isNotNull(notificationSubscriptions.artistEmailOptInAt),
        isNull(notificationSubscriptions.unsubscribedAt),
        or(...match)
      )
    );

  const sharedEmails = new Set<string>();
  const sharedPhones = new Set<string>();
  for (const s of subs) {
    if (!isSharedWithArtist(s.optInAt, s.optOutAt, s.unsubscribedAt)) continue;
    if (s.email) sharedEmails.add(s.email.trim().toLowerCase());
    if (s.phone) sharedPhones.add(s.phone.trim());
  }
  return { emails: sharedEmails, phones: sharedPhones };
}

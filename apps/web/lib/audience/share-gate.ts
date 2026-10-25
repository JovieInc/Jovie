/**
 * Level-2 "share with artist" gate for audience contact details.
 *
 * Level 1 (Jovie sends): anyone who subscribes receives verified events from
 * Jovie; the artist never sees their email or phone.
 * Level 2 (share with artist): only an explicit share opt-in
 * (the artist email opt-in timestamp on the subscription row, later than any
 * revocation) unlocks artist-visible contact details, and with them artist
 * messaging, export, vCard and ad targeting.
 *
 * Every artist-facing surface that returns or exports email/phone must go
 * through this module (enforced by tests/unit/lib/audience/contact-guard.test.ts).
 * This file is pure (no database imports) so client components can use the
 * fail-closed helpers; the database loader lives in share-gate.server.ts.
 *
 * Consent is resolved per person, not per row: for each normalized identifier
 * the latest revocation (artist opt-out or unsubscribe) on ANY duplicate row
 * beats an older opt-in on another row, the same rule the subscriber export
 * uses in lib/notifications/subscriber-export.ts.
 */

export interface ShareGateContact {
  email: string | null;
  phone: string | null;
  emailVisibleToArtist?: boolean;
}

export type ShareState = 'shared' | 'revoked';

export interface SharedContactKeys {
  readonly emails: ReadonlyMap<string, ShareState>;
  readonly phones: ReadonlyMap<string, ShareState>;
}

export const NO_SHARED_CONTACT_KEYS: SharedContactKeys = {
  emails: new Map(),
  phones: new Map(),
};

export interface ShareSubscriptionRow {
  readonly email: string | null;
  readonly phone: string | null;
  readonly optInAt: Date | string | null;
  readonly optOutAt: Date | string | null;
  readonly unsubscribedAt: Date | string | null;
}

const epoch = (value: Date | string | null | undefined): number | null => {
  if (!value) return null;
  const t = new Date(value).getTime();
  // An unparseable timestamp counts as the newest possible revocation.
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

export const normalizeShareEmail = (email: string): string =>
  email.trim().toLowerCase();
export const normalizeSharePhone = (phone: string): string => phone.trim();

/** Single-row helper kept for callers that only have one record. */
export function isSharedWithArtist(
  optInAt: Date | string | null | undefined,
  optOutAt: Date | string | null | undefined,
  unsubscribedAt?: Date | string | null
): boolean {
  const optIn = epoch(optInAt);
  if (optIn === null) return false;
  const revocation = Math.max(
    epoch(optOutAt) ?? Number.NEGATIVE_INFINITY,
    epoch(unsubscribedAt) ?? Number.NEGATIVE_INFINITY
  );
  return optIn > revocation;
}

/**
 * Resolve share state per normalized identifier across ALL duplicate rows,
 * including revoked and unsubscribed ones.
 */
export function resolveShareKeys(
  rows: readonly ShareSubscriptionRow[]
): SharedContactKeys {
  const acc = new Map<
    string,
    { kind: 'email' | 'phone'; key: string; optIn: number; revoke: number }
  >();
  const touch = (
    kind: 'email' | 'phone',
    key: string,
    row: ShareSubscriptionRow
  ) => {
    const id = `${kind}:${key}`;
    const cur = acc.get(id) ?? {
      kind,
      key,
      optIn: Number.NEGATIVE_INFINITY,
      revoke: Number.NEGATIVE_INFINITY,
    };
    cur.optIn = Math.max(cur.optIn, epoch(row.optInAt) ?? cur.optIn);
    cur.revoke = Math.max(
      cur.revoke,
      epoch(row.optOutAt) ?? Number.NEGATIVE_INFINITY,
      epoch(row.unsubscribedAt) ?? Number.NEGATIVE_INFINITY
    );
    acc.set(id, cur);
  };
  for (const row of rows) {
    if (row.email) touch('email', normalizeShareEmail(row.email), row);
    if (row.phone) touch('phone', normalizeSharePhone(row.phone), row);
  }
  const emails = new Map<string, ShareState>();
  const phones = new Map<string, ShareState>();
  for (const { kind, key, optIn, revoke } of acc.values()) {
    const shared = optIn > revoke;
    let state: ShareState | null = null;
    if (shared) state = 'shared';
    else if (revoke > Number.NEGATIVE_INFINITY) state = 'revoked';
    if (state) (kind === 'email' ? emails : phones).set(key, state);
  }
  return { emails, phones };
}

/**
 * Server: drop email/phone unless the person currently shares with this
 * artist. A match on either identifier unlocks both email and phone (one
 * share covers all channels); a revoked identifier hides the person. If a
 * per-channel consent column is added later, change this deliberately.
 */
export function applyShareGate<T extends ShareGateContact>(
  rows: readonly T[],
  keys: SharedContactKeys
): Array<T & { emailVisibleToArtist: boolean }> {
  return rows.map(row => {
    const states: (ShareState | undefined)[] = [
      row.email == null
        ? undefined
        : keys.emails.get(normalizeShareEmail(row.email)),
      row.phone == null
        ? undefined
        : keys.phones.get(normalizeSharePhone(row.phone)),
    ];
    const visible = states.includes('shared') && !states.includes('revoked');
    return visible
      ? { ...row, emailVisibleToArtist: true }
      : { ...row, email: null, phone: null, emailVisibleToArtist: false };
  });
}

/** Client defense in depth: may this row leave the app (CSV, vCard, copy)? Fails closed. */
export function canShareContactOut(
  row: Pick<ShareGateContact, 'emailVisibleToArtist'>
): boolean {
  return row.emailVisibleToArtist === true;
}

/** Client: strip contact details from a row that is not shared. */
export function redactUnsharedContact<T extends ShareGateContact>(row: T): T {
  return canShareContactOut(row) ? row : { ...row, email: null, phone: null };
}

/**
 * Canonical customer lifecycle (JOV-6888).
 *
 * Pure functions that map rows from the fragmented sources (leads, waitlist
 * entries, creator profiles, users) onto one ordered lifecycle stage and one
 * dedupe key, so every admin and growth surface reads the same funnel.
 */

export const CONTACT_LIFECYCLE_STAGES = [
  'suggested',
  'approved',
  'outreach',
  'profile_created',
  'certified',
  'signed_up',
  'claimed',
  'activated',
  'paying',
  'churned',
] as const;

export type ContactLifecycleStage = (typeof CONTACT_LIFECYCLE_STAGES)[number];

/**
 * Rank of each stage in the funnel. `churned` is terminal and outranks every
 * active stage so a deleted/former customer never reads as an active one.
 */
const STAGE_RANK: Record<ContactLifecycleStage, number> = {
  suggested: 0,
  approved: 1,
  outreach: 2,
  profile_created: 3,
  certified: 4,
  signed_up: 5,
  claimed: 6,
  activated: 7,
  paying: 8,
  churned: 9,
};

const STAGE_LABELS: Record<ContactLifecycleStage, string> = {
  suggested: 'Suggested',
  approved: 'Approved',
  outreach: 'Outreach',
  profile_created: 'Profile created',
  certified: 'Certified',
  signed_up: 'Signed up',
  claimed: 'Claimed',
  activated: 'Activated',
  paying: 'Paying',
  churned: 'Churned',
};

export function isContactLifecycleStage(
  value: unknown
): value is ContactLifecycleStage {
  return (
    typeof value === 'string' &&
    (CONTACT_LIFECYCLE_STAGES as readonly string[]).includes(value)
  );
}

export function getContactLifecycleStageLabel(
  stage: ContactLifecycleStage
): string {
  return STAGE_LABELS[stage];
}

export function contactLifecycleStageRank(
  stage: ContactLifecycleStage
): number {
  return STAGE_RANK[stage];
}

/**
 * Stable identity key used to merge a person across waitlist entries, leads,
 * creator profiles, and users. Normalized email wins; otherwise a normalized
 * handle (social or Jovie username) is used. Returns null when neither exists.
 */
export function contactDedupeKey(input: {
  email?: string | null;
  handle?: string | null;
}): string | null {
  const email = normalizeEmail(input.email);
  if (email) return `email:${email}`;
  const handle = normalizeHandle(input.handle);
  if (handle) return `handle:${handle}`;
  return null;
}

export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 && trimmed.includes('@') ? trimmed : null;
}

export function normalizeHandle(handle?: string | null): string | null {
  if (!handle) return null;
  let trimmed = handle.trim().toLowerCase().replace(/^@+/, '');
  while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
  return trimmed.length > 0 ? trimmed : null;
}

/** Signals gathered from whichever source rows describe the same person. */
export interface ContactSourceSignals {
  /** users.user_status lifecycle value. */
  userStatus?: string | null;
  /** users.deleted_at — a deleted account is treated as churned. */
  userDeleted?: boolean;
  /** users.is_pro, active Stripe subscription, or pro/max plan. */
  isPaying?: boolean;
  /** waitlist_entries.status. */
  waitlistStatus?: string | null;
  /** leads.status. */
  leadStatus?: string | null;
  /** Lead converted to a signup (leads.signup_user_id / signup_at set). */
  leadSignedUp?: boolean;
  /** Outreach actually started (dm/email sent or queued). */
  outreachStarted?: boolean;
  /** A creator_profiles row exists for this person. */
  profileExists?: boolean;
  /** Profile was claimed (claimed_at or profile_claimed user status). */
  profileClaimed?: boolean;
  /** Founder/agent certification override recorded on the contacts table. */
  certified?: boolean;
}

/**
 * Derive the furthest lifecycle stage implied by the source signals. Founder
 * certification counts as `certified` but never masks a later stage such as
 * `paying` or `churned`.
 */
export function deriveContactStage(
  signals: ContactSourceSignals
): ContactLifecycleStage {
  if (signals.userDeleted) return 'churned';
  if (signals.isPaying) return 'paying';
  if (signals.userStatus === 'active') return 'activated';
  if (signals.profileClaimed || signals.userStatus === 'profile_claimed') {
    return 'claimed';
  }
  if (
    signals.userStatus != null ||
    signals.waitlistStatus === 'signed_up' ||
    signals.waitlistStatus === 'claimed' ||
    signals.leadSignedUp
  ) {
    return 'signed_up';
  }
  if (signals.certified) return 'certified';
  if (signals.profileExists) return 'profile_created';
  if (signals.outreachStarted || signals.waitlistStatus === 'invited') {
    return 'outreach';
  }
  if (
    signals.waitlistStatus === 'approved' ||
    signals.leadStatus === 'approved' ||
    signals.leadStatus === 'ingested'
  ) {
    return 'approved';
  }
  return 'suggested';
}

/** One row per source record before canonical merging. */
export interface CanonicalContactSourceRow {
  dedupeKey: string;
  stage: ContactLifecycleStage;
  displayName: string | null;
  email: string | null;
  handle: string | null;
  avatarUrl: string | null;
  source: 'waitlist' | 'lead' | 'user' | 'profile';
  sourceId: string;
  /** Timestamp the row's stage was entered (best available evidence). */
  stageAt: Date | null;
  activityAt: Date | null;
  userId?: string | null;
  creatorProfileId?: string | null;
  leadId?: string | null;
  waitlistEntryId?: string | null;
}

/** One canonical person after merging every matching source row. */
export interface CanonicalContactRow {
  dedupeKey: string;
  stage: ContactLifecycleStage;
  displayName: string | null;
  email: string | null;
  handle: string | null;
  avatarUrl: string | null;
  sources: string[];
  sourceIds: Record<string, string[]>;
  stageAt: Date | null;
  activityAt: Date | null;
  firstSeenAt: Date | null;
  userId: string | null;
  creatorProfileId: string | null;
  leadId: string | null;
  waitlistEntryId: string | null;
}

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function minDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

/**
 * Merge source rows into one canonical row per dedupe key. The merged stage is
 * the highest-ranked stage across sources; identity fields prefer non-null
 * values from the highest-ranked contributing row, then first non-null.
 */
export function mergeCanonicalContacts(
  rows: readonly CanonicalContactSourceRow[]
): CanonicalContactRow[] {
  const byKey = new Map<string, CanonicalContactSourceRow[]>();
  for (const row of rows) {
    const bucket = byKey.get(row.dedupeKey);
    if (bucket) bucket.push(row);
    else byKey.set(row.dedupeKey, [row]);
  }

  const merged: CanonicalContactRow[] = [];
  for (const [dedupeKey, bucket] of byKey) {
    const top = bucket.reduce(
      (best, row) =>
        STAGE_RANK[row.stage] > STAGE_RANK[best.stage] ? row : best,
      bucket[0]
    );
    const firstNonNull = <T>(
      pick: (r: CanonicalContactSourceRow) => T | null
    ) => pick(top) ?? bucket.map(pick).find(v => v != null) ?? null;

    const sources = [...new Set(bucket.map(r => r.source))].sort((a, b) =>
      a.localeCompare(b)
    );
    const sourceIds: Record<string, string[]> = {};
    for (const row of bucket) {
      const ids = (sourceIds[row.source] ??= []);
      if (!ids.includes(row.sourceId)) ids.push(row.sourceId);
    }

    merged.push({
      dedupeKey,
      stage: top.stage,
      displayName: firstNonNull(r => r.displayName),
      email: firstNonNull(r => r.email),
      handle: firstNonNull(r => r.handle),
      avatarUrl: firstNonNull(r => r.avatarUrl),
      sources,
      sourceIds,
      stageAt: top.stageAt,
      activityAt: bucket.reduce(
        (acc, r) => maxDate(acc, r.activityAt),
        null as Date | null
      ),
      firstSeenAt: bucket.reduce(
        (acc, r) => minDate(acc, r.activityAt),
        null as Date | null
      ),
      userId: firstNonNull(r => r.userId ?? null),
      creatorProfileId: firstNonNull(r => r.creatorProfileId ?? null),
      leadId: firstNonNull(r => r.leadId ?? null),
      waitlistEntryId: firstNonNull(r => r.waitlistEntryId ?? null),
    });
  }

  return merged;
}

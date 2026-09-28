import 'server-only';

import { desc, eq } from 'drizzle-orm';
import {
  type CanonicalContactRow,
  type CanonicalContactSourceRow,
  type ContactLifecycleStage,
  contactDedupeKey,
  contactLifecycleStageRank,
  deriveContactStage,
  isContactLifecycleStage,
  mergeCanonicalContacts,
} from '@/lib/contacts/lifecycle';
import { db, doesTableExist } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { contactStageTransitions, contacts } from '@/lib/db/schema/contacts';
import { leads } from '@/lib/db/schema/leads';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { captureError } from '@/lib/error-tracking';

/**
 * Canonical customer/prospect read model (JOV-6888).
 *
 * The canonical table is a live projection over the four legacy source tables,
 * deduped by normalized email/handle via `contactDedupeKey`, with founder
 * overrides and transition history persisted on `contacts` /
 * `contact_stage_transitions`.
 */

// Safety bound per source table; admin datasets are far below this today.
const SOURCE_SCAN_LIMIT = 5000;

export type CanonicalContactSource =
  | 'waitlist'
  | 'lead'
  | 'user'
  | 'profile'
  | 'contact';

export interface CanonicalContactListRow extends CanonicalContactRow {
  /** Founder/agent override stage persisted on the contacts table, if any. */
  overrideStage: ContactLifecycleStage | null;
  certifiedAt: Date | null;
}

export interface GetCanonicalContactsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  stage?: string | null;
}

export type CanonicalContactMetrics = Record<ContactLifecycleStage, number> & {
  total: number;
};

export interface GetCanonicalContactsResult {
  contacts: CanonicalContactListRow[];
  metrics: CanonicalContactMetrics;
  page: number;
  pageSize: number;
  total: number;
}

function emptyMetrics(): CanonicalContactMetrics {
  return {
    total: 0,
    suggested: 0,
    approved: 0,
    outreach: 0,
    profile_created: 0,
    certified: 0,
    signed_up: 0,
    claimed: 0,
    activated: 0,
    paying: 0,
    churned: 0,
  };
}

interface ContactOverrideRow {
  dedupeKey: string;
  stage: ContactLifecycleStage;
  certifiedAt: Date | null;
}

function latestDate(...values: Array<Date | null | undefined>): Date | null {
  let best: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!best || value > best) best = value;
  }
  return best;
}

function sourceRow(
  partial: Omit<CanonicalContactSourceRow, 'dedupeKey'> & {
    email?: string | null;
    handle?: string | null;
  }
): CanonicalContactSourceRow | null {
  const dedupeKey = contactDedupeKey({
    email: partial.email,
    handle: partial.handle,
  });
  if (!dedupeKey) return null;
  return { ...partial, dedupeKey };
}

async function collectSourceRows(): Promise<CanonicalContactSourceRow[]> {
  const [waitlistRows, leadRows, userRows, profileRows] = await Promise.all([
    db
      .select({
        id: waitlistEntries.id,
        fullName: waitlistEntries.fullName,
        emailNormalized: waitlistEntries.emailNormalized,
        status: waitlistEntries.status,
        socialUrl: waitlistEntries.primarySocialUrlNormalized,
        approvedAt: waitlistEntries.approvedAt,
        invitedAt: waitlistEntries.invitedAt,
        signedUpAt: waitlistEntries.signedUpAt,
        waitlistedAt: waitlistEntries.waitlistedAt,
        createdAt: waitlistEntries.createdAt,
        updatedAt: waitlistEntries.updatedAt,
      })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.canonical, true))
      .orderBy(desc(waitlistEntries.createdAt))
      .limit(SOURCE_SCAN_LIMIT),
    db
      .select({
        id: leads.id,
        displayName: leads.displayName,
        contactEmail: leads.contactEmail,
        handle: leads.linktreeHandle,
        status: leads.status,
        outreachStatus: leads.outreachStatus,
        avatarUrl: leads.avatarUrl,
        creatorProfileId: leads.creatorProfileId,
        signupUserId: leads.signupUserId,
        approvedAt: leads.approvedAt,
        ingestedAt: leads.ingestedAt,
        firstContactedAt: leads.firstContactedAt,
        signupAt: leads.signupAt,
        paidAt: leads.paidAt,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
      })
      .from(leads)
      .orderBy(desc(leads.createdAt))
      .limit(SOURCE_SCAN_LIMIT),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        userStatus: users.userStatus,
        isPro: users.isPro,
        plan: users.plan,
        stripeSubscriptionId: users.stripeSubscriptionId,
        deletedAt: users.deletedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(SOURCE_SCAN_LIMIT),
    db
      .select({
        id: creatorProfiles.id,
        userId: creatorProfiles.userId,
        waitlistEntryId: creatorProfiles.waitlistEntryId,
        usernameNormalized: creatorProfiles.usernameNormalized,
        displayName: creatorProfiles.displayName,
        avatarUrl: creatorProfiles.avatarUrl,
        isVerified: creatorProfiles.isVerified,
        claimedAt: creatorProfiles.claimedAt,
        dmSentAt: creatorProfiles.dmSentAt,
        createdAt: creatorProfiles.createdAt,
        updatedAt: creatorProfiles.updatedAt,
      })
      .from(creatorProfiles)
      .orderBy(desc(creatorProfiles.createdAt))
      .limit(SOURCE_SCAN_LIMIT),
  ]);

  const rows: CanonicalContactSourceRow[] = [];

  // Cross-source identity hints: a profile or lead linked to a user/waitlist
  // row should dedupe onto that person's email key instead of its own handle.
  const emailByUserId = new Map<string, string>();
  for (const user of userRows) {
    const email = user.email?.trim().toLowerCase();
    if (email) emailByUserId.set(user.id, email);
  }
  const emailByWaitlistEntryId = new Map<string, string>();
  for (const entry of waitlistRows) {
    const email = entry.emailNormalized?.trim().toLowerCase();
    if (email) emailByWaitlistEntryId.set(entry.id, email);
  }

  for (const entry of waitlistRows) {
    const outreachStarted = entry.status === 'invited';
    const row = sourceRow({
      stage: deriveContactStage({
        waitlistStatus: entry.status,
        outreachStarted,
      }),
      displayName: entry.fullName,
      email: entry.emailNormalized,
      handle: entry.socialUrl,
      avatarUrl: null,
      source: 'waitlist',
      sourceId: entry.id,
      stageAt: latestDate(
        entry.signedUpAt,
        entry.invitedAt,
        entry.approvedAt,
        entry.waitlistedAt,
        entry.createdAt
      ),
      activityAt: latestDate(entry.updatedAt, entry.createdAt),
      waitlistEntryId: entry.id,
    });
    if (row) rows.push(row);
  }

  for (const lead of leadRows) {
    const outreachStarted =
      lead.outreachStatus === 'sent' ||
      lead.outreachStatus === 'dm_sent' ||
      lead.outreachStatus === 'queued' ||
      lead.firstContactedAt != null;
    const stage =
      lead.paidAt != null
        ? 'paying'
        : deriveContactStage({
            leadStatus: lead.status,
            leadSignedUp: lead.signupUserId != null || lead.signupAt != null,
            outreachStarted,
            profileExists: lead.creatorProfileId != null,
          });
    const row = sourceRow({
      stage,
      displayName: lead.displayName,
      email:
        lead.contactEmail ??
        (lead.signupUserId
          ? (emailByUserId.get(lead.signupUserId) ?? null)
          : null),
      handle: lead.handle,
      avatarUrl: lead.avatarUrl,
      source: 'lead',
      sourceId: lead.id,
      stageAt: latestDate(
        lead.paidAt,
        lead.signupAt,
        lead.firstContactedAt,
        lead.ingestedAt,
        lead.approvedAt,
        lead.createdAt
      ),
      activityAt: latestDate(lead.updatedAt, lead.createdAt),
      leadId: lead.id,
      creatorProfileId: lead.creatorProfileId,
      userId: lead.signupUserId,
    });
    if (row) rows.push(row);
  }

  for (const user of userRows) {
    const isPaying =
      user.isPro === true ||
      user.plan === 'pro' ||
      user.plan === 'max' ||
      user.stripeSubscriptionId != null;
    const row = sourceRow({
      stage: deriveContactStage({
        userStatus: user.userStatus,
        userDeleted: user.deletedAt != null,
        isPaying,
      }),
      displayName: user.name,
      email: user.email,
      handle: null,
      avatarUrl: null,
      source: 'user',
      sourceId: user.id,
      stageAt: latestDate(user.deletedAt, user.createdAt),
      activityAt: latestDate(user.updatedAt, user.createdAt),
      userId: user.id,
    });
    if (row) rows.push(row);
  }

  for (const profile of profileRows) {
    const outreachStarted = profile.dmSentAt != null;
    const profileEmail =
      (profile.userId ? emailByUserId.get(profile.userId) : undefined) ??
      (profile.waitlistEntryId
        ? emailByWaitlistEntryId.get(profile.waitlistEntryId)
        : undefined) ??
      null;
    const row = sourceRow({
      stage: deriveContactStage({
        profileExists: true,
        profileClaimed: profile.claimedAt != null,
        certified: profile.isVerified === true,
        outreachStarted,
      }),
      displayName: profile.displayName ?? profile.usernameNormalized,
      email: profileEmail,
      handle: profile.usernameNormalized,
      avatarUrl: profile.avatarUrl,
      source: 'profile',
      sourceId: profile.id,
      stageAt: latestDate(profile.claimedAt, profile.createdAt),
      activityAt: latestDate(profile.updatedAt, profile.createdAt),
      creatorProfileId: profile.id,
      userId: profile.userId,
      waitlistEntryId: profile.waitlistEntryId,
    });
    if (row) rows.push(row);
  }

  return rows;
}

async function getContactOverrides(): Promise<Map<string, ContactOverrideRow>> {
  const map = new Map<string, ContactOverrideRow>();
  if (!(await doesTableExist('contacts'))) return map;

  const rows = await db
    .select({
      dedupeKey: contacts.dedupeKey,
      stage: contacts.stage,
      certifiedAt: contacts.certifiedAt,
    })
    .from(contacts);

  for (const row of rows) {
    map.set(row.dedupeKey, {
      dedupeKey: row.dedupeKey,
      stage: row.stage,
      certifiedAt: row.certifiedAt,
    });
  }
  return map;
}

/**
 * Apply founder/agent overrides persisted on `contacts`: an override only moves
 * a person forward (or to `churned`), never backward below their derived stage.
 */
function applyOverrides(
  merged: CanonicalContactRow[],
  overrides: Map<string, ContactOverrideRow>
): CanonicalContactListRow[] {
  return merged.map(row => {
    const override = overrides.get(row.dedupeKey);
    if (!override) {
      return { ...row, overrideStage: null, certifiedAt: null };
    }
    const effective =
      contactLifecycleStageRank(override.stage) >=
      contactLifecycleStageRank(row.stage)
        ? override.stage
        : row.stage;
    return {
      ...row,
      stage: effective,
      overrideStage: override.stage,
      certifiedAt: override.certifiedAt,
      sources: row.sources.includes('contact')
        ? row.sources
        : [...row.sources, 'contact'].sort(),
    };
  });
}

async function buildCanonicalContacts(): Promise<CanonicalContactListRow[]> {
  const [sourceRows, overrides] = await Promise.all([
    collectSourceRows(),
    getContactOverrides(),
  ]);
  return applyOverrides(mergeCanonicalContacts(sourceRows), overrides);
}

function matchesSearch(row: CanonicalContactListRow, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [row.displayName, row.email, row.handle].some(
    field => field != null && field.toLowerCase().includes(needle)
  );
}

export async function getCanonicalContacts(
  params: GetCanonicalContactsParams = {}
): Promise<GetCanonicalContactsResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));
  const stageFilter = isContactLifecycleStage(params.stage)
    ? params.stage
    : null;

  try {
    const all = await buildCanonicalContacts();

    // Stage metrics derive from the same canonical set — one funnel, one
    // dedupe — so growth counts never diverge per surface.
    const metrics = emptyMetrics();
    for (const row of all) {
      metrics[row.stage] += 1;
      metrics.total += 1;
    }

    const filtered = all
      .filter(row => (stageFilter ? row.stage === stageFilter : true))
      .filter(row => matchesSearch(row, params.search ?? ''))
      .sort((a, b) => {
        const aTime = a.activityAt?.getTime() ?? 0;
        const bTime = b.activityAt?.getTime() ?? 0;
        return bTime - aTime;
      });

    const offset = (page - 1) * pageSize;
    return {
      contacts: filtered.slice(offset, offset + pageSize),
      metrics,
      page,
      pageSize,
      total: filtered.length,
    };
  } catch (error) {
    captureError('Error loading canonical contacts', error, {
      page,
      pageSize,
      stage: stageFilter,
    });
    return { contacts: [], metrics: emptyMetrics(), page, pageSize, total: 0 };
  }
}

/**
 * Growth metrics derived from the canonical lifecycle instead of per-surface
 * counts: one funnel, one dedupe.
 */
export async function getCanonicalContactMetrics(): Promise<CanonicalContactMetrics> {
  const { metrics } = await getCanonicalContacts({ page: 1, pageSize: 1 });
  return metrics;
}

export interface SetCanonicalContactStageParams {
  dedupeKey: string;
  toStage: ContactLifecycleStage;
  actorUserId?: string | null;
  actorType?: 'founder' | 'agent' | 'system';
  reason?: string | null;
  identity?: {
    displayName?: string | null;
    emailNormalized?: string | null;
    primaryHandle?: string | null;
    avatarUrl?: string | null;
    userId?: string | null;
    creatorProfileId?: string | null;
    leadId?: string | null;
    waitlistEntryId?: string | null;
  };
}

/**
 * Founder/agent stage change: upserts the canonical contact row and appends a
 * transition to `contact_stage_transitions`, preserving full provenance.
 */
export async function setCanonicalContactStage(
  params: SetCanonicalContactStageParams
): Promise<{ ok: true; stage: ContactLifecycleStage } | { ok: false }> {
  if (!(await doesTableExist('contacts'))) return { ok: false };

  const now = new Date();
  const [existing] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.dedupeKey, params.dedupeKey))
    .limit(1);

  const identity = params.identity ?? {};
  const certifiedAt =
    params.toStage === 'certified'
      ? (existing?.certifiedAt ?? now)
      : (existing?.certifiedAt ?? null);
  const certifiedByUserId =
    params.toStage === 'certified'
      ? (params.actorUserId ?? existing?.certifiedByUserId ?? null)
      : (existing?.certifiedByUserId ?? null);

  let contactId: string;
  if (existing) {
    contactId = existing.id;
    await db
      .update(contacts)
      .set({
        displayName: identity.displayName ?? existing.displayName,
        emailNormalized: identity.emailNormalized ?? existing.emailNormalized,
        primaryHandle: identity.primaryHandle ?? existing.primaryHandle,
        avatarUrl: identity.avatarUrl ?? existing.avatarUrl,
        userId: identity.userId ?? existing.userId,
        creatorProfileId:
          identity.creatorProfileId ?? existing.creatorProfileId,
        leadId: identity.leadId ?? existing.leadId,
        waitlistEntryId: identity.waitlistEntryId ?? existing.waitlistEntryId,
        stage: params.toStage,
        stageEnteredAt: now,
        stageSource: params.actorType ?? 'founder',
        certifiedAt,
        certifiedByUserId,
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(eq(contacts.id, existing.id));
  } else {
    const [inserted] = await db
      .insert(contacts)
      .values({
        dedupeKey: params.dedupeKey,
        displayName: identity.displayName ?? null,
        emailNormalized: identity.emailNormalized ?? null,
        primaryHandle: identity.primaryHandle ?? null,
        avatarUrl: identity.avatarUrl ?? null,
        userId: identity.userId ?? null,
        creatorProfileId: identity.creatorProfileId ?? null,
        leadId: identity.leadId ?? null,
        waitlistEntryId: identity.waitlistEntryId ?? null,
        stage: params.toStage,
        stageEnteredAt: now,
        stageSource: params.actorType ?? 'founder',
        certifiedAt,
        certifiedByUserId,
        firstSeenAt: now,
        lastActivityAt: now,
      })
      .returning({ id: contacts.id });
    contactId = inserted.id;
  }

  await db.insert(contactStageTransitions).values({
    contactId,
    dedupeKey: params.dedupeKey,
    fromStage: existing?.stage ?? null,
    toStage: params.toStage,
    actorType: params.actorType ?? 'founder',
    actorId: params.actorUserId ?? null,
    source: 'admin_contacts',
    reason: params.reason ?? null,
  });

  return { ok: true, stage: params.toStage };
}

export interface ContactStageTimelineItem {
  id: string;
  fromStage: ContactLifecycleStage | null;
  toStage: ContactLifecycleStage;
  actorType: string;
  actorId: string | null;
  source: string | null;
  reason: string | null;
  createdAt: Date;
}

/** Append-only transition history for one canonical person. */
export async function getContactStageTimeline(
  dedupeKey: string
): Promise<ContactStageTimelineItem[]> {
  if (!(await doesTableExist('contact_stage_transitions'))) return [];

  const rows = await db
    .select()
    .from(contactStageTransitions)
    .where(eq(contactStageTransitions.dedupeKey, dedupeKey))
    .orderBy(desc(contactStageTransitions.createdAt))
    .limit(200);

  return rows.map(row => ({
    id: row.id,
    fromStage: row.fromStage,
    toStage: row.toStage,
    actorType: row.actorType,
    actorId: row.actorId,
    source: row.source,
    reason: row.reason,
    createdAt: row.createdAt,
  }));
}

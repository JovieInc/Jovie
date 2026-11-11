import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { capabilityWants, waitlistEntries } from '@/lib/db/schema/waitlist';
import { normalizeEmail } from '@/lib/utils/email';
import {
  type QualificationDecision,
  roleFormOutcomeToStatus,
} from '@/lib/waitlist/decision';
import {
  qualificationInputsPatch,
  type RoleEntrantQualification,
} from '@/lib/waitlist/role-qualification';
import type { WaitlistRole } from '@/lib/waitlist/roles';
import { hashEmailForWaitlist } from '@/lib/waitlist/signup-entry';

/**
 * Source of entries created by the closed-signup `/waitlist` role form
 * (canon/PRODUCT.md, 2026-11-02). No account exists yet; an admin invite
 * (`/waitlist/invite?token=`) is the only way in.
 */
export const ROLE_FORM_WAITLIST_SOURCE = 'waitlist_role_form' as const;

export interface JoinWaitlistWithRoleResult {
  /** True when this request created the entry; false for a known email. */
  readonly created: boolean;
  readonly entryId: string | null;
}

/**
 * Reuses `waitlist_entries` (no new store). The role lives on
 * `qualification_inputs.role` with its own capture timestamp, so submissions
 * by role are countable per person without a schema change. A known email
 * keeps its status and only gains a role when it has none yet.
 *
 * Persistence-critical: throws on failure so the route never reports a
 * join that did not commit.
 */
export async function joinWaitlistWithRole(input: {
  readonly email: string;
  readonly role: WaitlistRole;
  readonly name?: string;
  /** Request-access qualification; see `qualifyRoleEntrant`. */
  readonly qualification?: RoleEntrantQualification | null;
  /** Mom Test decision (qualify/2026-11-v1); drives status + decision columns. */
  readonly decision?: QualificationDecision | null;
  readonly now?: Date;
}): Promise<JoinWaitlistWithRoleResult> {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error('A valid email is required to join the waitlist');
  const now = input.now ?? new Date();
  const capturedAt = now.toISOString();
  const name = input.name?.trim() || null;
  const qualification = input.qualification
    ? qualificationInputsPatch(input.qualification)
    : {};
  const qualificationJson =
    Object.keys(qualification).length > 0
      ? JSON.stringify(qualification)
      : null;
  const artistName = input.qualification?.spotifyArtistName ?? null;

  // Mom Test funnel (qualify/2026-11-v1): the decision owns the initial
  // status. No decision (no answers at all) stays pending review as `new` —
  // never `waitlisted`, which is reachable only from disqualified.
  const decision = input.decision ?? null;
  const status = decision ? roleFormOutcomeToStatus(decision.outcome) : 'new';
  const statusTimestamps = {
    ...(status === 'qualified' ? { qualifiedAt: now } : {}),
  };

  const [row] = await db
    .insert(waitlistEntries)
    .values({
      email,
      emailNormalized: email,
      emailHash: hashEmailForWaitlist(email),
      source: ROLE_FORM_WAITLIST_SOURCE,
      canonical: true,
      status,
      statusReason: decision ? decision.reason : 'pending_review',
      decisionReason: decision ? decision.reason : null,
      decisionRuleVersion: decision ? decision.ruleVersion : null,
      decidedAt: decision ? now : null,
      decidedBy: decision ? 'rules' : null,
      waitlistedAt: null,
      ...statusTimestamps,
      ...(artistName ? { spotifyArtistName: artistName } : {}),
      qualificationInputs: {
        role: input.role,
        roleCapturedAt: capturedAt,
        ...(name ? { name } : {}),
        ...qualification,
      },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: waitlistEntries.emailNormalized,
      targetWhere: drizzleSql`${waitlistEntries.canonical} = true`,
      set: {
        // A known email gains qualification only when it has none yet, so a
        // repeat submission can't overwrite an earlier score or answers.
        qualificationInputs: drizzleSql`coalesce(${waitlistEntries.qualificationInputs}, '{}'::jsonb) || jsonb_build_object('role', coalesce(${waitlistEntries.qualificationInputs}->>'role', ${input.role}::text), 'roleCapturedAt', coalesce(${waitlistEntries.qualificationInputs}->>'roleCapturedAt', ${capturedAt}::text)) || case when ${waitlistEntries.qualificationInputs}->>'name' is null and ${name}::text is not null then jsonb_build_object('name', ${name}::text) else '{}'::jsonb end || case when ${waitlistEntries.qualificationInputs}->'admissionScore' is null and ${waitlistEntries.qualificationInputs}->'momTest' is null and ${qualificationJson}::text is not null then ${qualificationJson}::jsonb else '{}'::jsonb end`,
        spotifyArtistName: drizzleSql`coalesce(${waitlistEntries.spotifyArtistName}, ${artistName}::text)`,
        updatedAt: now,
      },
      setWhere: drizzleSql`${waitlistEntries.qualificationInputs}->>'role' IS NULL or (${waitlistEntries.qualificationInputs}->>'name' IS NULL and ${name}::text IS NOT NULL) or (${qualificationJson}::text IS NOT NULL and ${waitlistEntries.qualificationInputs}->'admissionScore' IS NULL and ${waitlistEntries.qualificationInputs}->'momTest' IS NULL)`,
    })
    .returning({
      created: drizzleSql<boolean>`(xmax = 0)`,
      id: waitlistEntries.id,
    });

  const created = row?.created === true;
  const entryId = row?.id ?? null;

  // Store what they asked for / objected to / already use, in their words
  // (JOV-6655). Only on create — a repeat submission never re-logs wants.
  if (created && entryId && decision && decision.wants.length > 0) {
    await db.insert(capabilityWants).values(
      decision.wants.map(want => ({
        waitlistEntryId: entryId,
        kind: want.kind,
        text: want.text,
        capabilityKey: want.capabilityKey,
        source: 'role_form',
        sourceTurnId: want.sourceTurnId,
        questionVariant: input.qualification?.momTest?.variant ?? null,
      }))
    );
  }

  return { created, entryId };
}

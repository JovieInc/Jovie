import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { normalizeEmail } from '@/lib/utils/email';
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

  const [row] = await db
    .insert(waitlistEntries)
    .values({
      email,
      emailNormalized: email,
      emailHash: hashEmailForWaitlist(email),
      source: ROLE_FORM_WAITLIST_SOURCE,
      canonical: true,
      status: 'waitlisted',
      statusReason: 'role_form_pending_review',
      waitlistedAt: now,
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
    });

  return { created: row?.created === true };
}

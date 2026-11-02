import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { normalizeEmail } from '@/lib/utils/email';
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
  readonly now?: Date;
}): Promise<JoinWaitlistWithRoleResult> {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error('A valid email is required to join the waitlist');
  const now = input.now ?? new Date();
  const capturedAt = now.toISOString();

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
      qualificationInputs: { role: input.role, roleCapturedAt: capturedAt },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: waitlistEntries.emailNormalized,
      targetWhere: drizzleSql`${waitlistEntries.canonical} = true`,
      set: {
        qualificationInputs: drizzleSql`coalesce(${waitlistEntries.qualificationInputs}, '{}'::jsonb) || jsonb_build_object('role', ${input.role}::text, 'roleCapturedAt', ${capturedAt}::text)`,
        updatedAt: now,
      },
      setWhere: drizzleSql`${waitlistEntries.qualificationInputs}->>'role' IS NULL`,
    })
    .returning({
      created: drizzleSql<boolean>`(xmax = 0)`,
    });

  return { created: row?.created === true };
}

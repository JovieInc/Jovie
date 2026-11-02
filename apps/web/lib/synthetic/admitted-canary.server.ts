import 'server-only';

import { and, sql as drizzleSql, eq, ne } from 'drizzle-orm';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { readClaimVerification } from '@/lib/claim/claim-verification';
import { decideClaimVerification } from '@/lib/claim/claim-verification-review.server';
import { db } from '@/lib/db';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { assertSpotifyProfileIdentityAvailable } from '@/lib/profile/spotify-profile-identity';
import { approveWaitlistEntryInTx } from '@/lib/waitlist/approval';
import { insertWaitlistAuditLog } from '@/lib/waitlist/audit';
import { insertSignupWaitlistEntry } from '@/lib/waitlist/signup-entry';
import type { WaitlistStatus } from '@/lib/waitlist/state-machine';
import {
  ADMITTED_CANARY_ACTOR,
  ADMITTED_CANARY_FIXTURE,
  ADMITTED_CANARY_FIXTURE_SCHEMA,
  type AdmittedCanaryFixture,
  AdmittedCanaryGuardError,
  type AdmittedCanaryObservedState,
  type AdmittedCanaryStep,
  assertAdmittedCanaryOwnershipEligible,
  isAdmittedCanaryEmail,
  planAdmittedCanary,
} from './admitted-canary-fixture';

/**
 * Admitted canary reconciler (domain module `synthetic.admitted-canary`).
 *
 * Every write here targets only the fixture identity: the user is found by
 * exact address, the profile by the fixture handle bound to that user or its
 * waitlist entry. Admission goes through `approveWaitlistEntryInTx` (system
 * actor, so the product's proof-before-public rule applies and holds the page
 * private) and ownership through `decideClaimVerification`, the operator
 * decision. No invite email or Summer card is created.
 */

const ATOMIC_ACTOR = 'system_admitted_canary';

export async function readAdmittedCanaryState(
  fixture: AdmittedCanaryFixture = ADMITTED_CANARY_FIXTURE
): Promise<AdmittedCanaryObservedState> {
  const [user] = await db
    .select({
      id: users.id,
      waitlistEntryId: users.waitlistEntryId,
      userStatus: users.userStatus,
    })
    .from(users)
    .where(drizzleSql`lower(trim(${users.email})) = ${fixture.email}`)
    .limit(1);

  const [waitlistEntry] = await db
    .select({ id: waitlistEntries.id, status: waitlistEntries.status })
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.emailNormalized, fixture.email),
        eq(waitlistEntries.canonical, true)
      )
    )
    .limit(1);

  const [byHandle] = await db
    .select({
      id: creatorProfiles.id,
      handle: creatorProfiles.usernameNormalized,
      spotifyId: creatorProfiles.spotifyId,
      userId: creatorProfiles.userId,
      waitlistEntryId: creatorProfiles.waitlistEntryId,
      isClaimed: creatorProfiles.isClaimed,
      isPublic: creatorProfiles.isPublic,
      settings: creatorProfiles.settings,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, fixture.handle))
    .limit(1);

  const ours =
    byHandle &&
    ((user && byHandle.userId === user.id) ||
      (waitlistEntry && byHandle.waitlistEntryId === waitlistEntry.id));

  const [artistHolder] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.spotifyId, fixture.artist.spotifyId),
        ours ? ne(creatorProfiles.id, byHandle.id) : undefined
      )
    )
    .limit(1);

  let ownerClaimRow = false;
  if (ours && user) {
    const [claim] = await db
      .select({ id: userProfileClaims.id })
      .from(userProfileClaims)
      .where(
        and(
          eq(userProfileClaims.creatorProfileId, byHandle.id),
          eq(userProfileClaims.userId, user.id),
          eq(userProfileClaims.role, 'owner')
        )
      )
      .limit(1);
    ownerClaimRow = Boolean(claim);
  }

  const record = ours ? readClaimVerification(byHandle.settings) : null;
  return {
    user: user
      ? {
          id: user.id,
          waitlistEntryId: user.waitlistEntryId ?? null,
          userStatus: user.userStatus ?? null,
        }
      : null,
    waitlistEntry: waitlistEntry
      ? { id: waitlistEntry.id, status: waitlistEntry.status }
      : null,
    profile: ours
      ? {
          id: byHandle.id,
          handle: byHandle.handle,
          spotifyId: byHandle.spotifyId,
          userId: byHandle.userId,
          waitlistEntryId: byHandle.waitlistEntryId,
          isClaimed: byHandle.isClaimed === true,
          isPublic: byHandle.isPublic === true,
          claimVerificationStatus: record?.status ?? null,
          proofOnly: record?.proofOnly === true,
        }
      : null,
    ownerClaimRow,
    handleHeldByOther: Boolean(byHandle) && !ours,
    artistHeldByOther: Boolean(artistHolder),
  };
}

export type AdmittedCanaryOwnershipResult =
  | { readonly outcome: 'verified'; readonly profileId: string }
  | { readonly outcome: 'already_verified'; readonly profileId: string };

/**
 * The canary-only ownership path. Ownership is "proven" because the profile's
 * owner is the exact fixture address (a Jovie-controlled mailbox) and the
 * profile carries exactly the fixture artist and handle. Anything else throws
 * before any write. The decision is the product's operator decision, recorded
 * with `decidedBy = system_admitted_canary`, plus a waitlist audit row.
 */
export async function verifyAdmittedCanaryOwnership(input: {
  readonly profileId: string;
  readonly fixture?: AdmittedCanaryFixture;
  readonly now?: Date;
}): Promise<AdmittedCanaryOwnershipResult> {
  const fixture = input.fixture ?? ADMITTED_CANARY_FIXTURE;
  const [row] = await db
    .select({
      handle: creatorProfiles.usernameNormalized,
      spotifyId: creatorProfiles.spotifyId,
      settings: creatorProfiles.settings,
      ownerEmail: users.email,
      waitlistEntryId: users.waitlistEntryId,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.id, input.profileId))
    .limit(1);

  assertAdmittedCanaryOwnershipEligible(row ?? null, fixture);

  const record = readClaimVerification(row.settings);
  if (record?.status === 'verified') {
    return { outcome: 'already_verified', profileId: input.profileId };
  }

  const decision = await decideClaimVerification({
    profileId: input.profileId,
    decision: 'approve',
    decidedBy: ADMITTED_CANARY_ACTOR,
    reason: `${fixture.schema} v${fixture.version}: canary fixture, owner is the exact Jovie-controlled canary address`,
    // No Summer card is ever filed for the canary, so there is none to sync.
    fromCard: true,
    now: input.now,
  });
  if (decision.outcome !== 'decided') {
    throw new AdmittedCanaryGuardError(
      `Ownership decision did not apply: ${decision.outcome}`
    );
  }

  if (row.waitlistEntryId) {
    await insertWaitlistAuditLog(db, {
      waitlistEntryId: row.waitlistEntryId,
      toStatus: fixture.waitlistTargetStatus as WaitlistStatus,
      actorType: 'system',
      reason: 'admitted_canary_ownership_verified',
      metadata: {
        schema: ADMITTED_CANARY_FIXTURE_SCHEMA,
        fixtureVersion: fixture.version,
        profileId: input.profileId,
        spotifyArtistId: fixture.artist.spotifyId,
        decidedBy: ADMITTED_CANARY_ACTOR,
      },
    });
  }
  return { outcome: 'verified', profileId: input.profileId };
}

async function createHeldProfile(
  state: AdmittedCanaryObservedState,
  fixture: AdmittedCanaryFixture
): Promise<void> {
  const entryId = state.waitlistEntry?.id;
  if (!entryId) throw new AdmittedCanaryGuardError('No waitlist entry');
  await runAtomicDbOperation(
    async tx => {
      await assertSpotifyProfileIdentityAvailable(
        tx,
        fixture.artist.spotifyId,
        null
      );
      const [taken] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.usernameNormalized, fixture.handle))
        .limit(1);
      if (taken) {
        throw new AdmittedCanaryGuardError(
          `Handle ${fixture.handle} is held by another profile`
        );
      }
      // Same shape as a reserved waitlist hold: unclaimed and private until
      // approval binds it and the ownership decision publishes it.
      await tx.insert(creatorProfiles).values({
        creatorType: 'artist',
        username: fixture.handle,
        usernameNormalized: fixture.handle,
        displayName: fixture.displayName,
        spotifyId: fixture.artist.spotifyId,
        spotifyUrl: fixture.artist.url,
        waitlistEntryId: entryId,
        isClaimed: false,
        isPublic: false,
        settings: {
          admittedCanary: {
            schema: ADMITTED_CANARY_FIXTURE_SCHEMA,
            version: fixture.version,
          },
        },
      });
    },
    { actorId: ATOMIC_ACTOR, system: true, retry: 'serialization' }
  );
}

async function approveEntry(
  state: AdmittedCanaryObservedState,
  fixture: AdmittedCanaryFixture
): Promise<void> {
  const entryId = state.waitlistEntry?.id;
  if (!entryId) throw new AdmittedCanaryGuardError('No waitlist entry');
  const result = await runAtomicDbOperation(
    tx =>
      approveWaitlistEntryInTx(tx, entryId, {
        actorType: 'system',
        reason: `admitted_canary_fixture_v${fixture.version}`,
        targetStatus: fixture.waitlistTargetStatus,
      }),
    { actorId: ATOMIC_ACTOR, system: true, retry: 'serialization' }
  );
  if (result.outcome !== 'approved') {
    throw new AdmittedCanaryGuardError(`Approval outcome: ${result.outcome}`);
  }
  // Deliberately not finalizeWaitlistApproval: that files an operator card
  // for the proof request, and the canary's proof is decided right after.
  if (result.clerkId) await invalidateProxyUserStateCache(result.clerkId);
}

async function ensureOwnerClaim(
  state: AdmittedCanaryObservedState
): Promise<void> {
  const userId = state.user?.id;
  const profileId = state.profile?.id;
  if (!userId || !profileId) {
    throw new AdmittedCanaryGuardError('Owner claim needs user and profile');
  }
  await runAtomicDbOperation(
    tx =>
      tx
        .insert(userProfileClaims)
        .values({ userId, creatorProfileId: profileId, role: 'owner' })
        .onConflictDoNothing(),
    { actorId: ATOMIC_ACTOR, system: true, retry: 'serialization' }
  );
}

export interface AdmittedCanaryStepResult extends AdmittedCanaryStep {
  readonly startedAt: string;
  readonly endedAt: string;
  readonly outcome: 'planned' | 'done' | 'skipped' | 'failed';
  readonly error?: string;
}

/**
 * Plan (dry run) or converge production to the fixture. Re-reads state after
 * every write so each step acts on fresh rows; stops at the first failure or
 * blocked step. Idempotent: a converged fixture plans all `ok` and writes
 * nothing.
 */
export async function reconcileAdmittedCanary(input: {
  readonly apply: boolean;
  readonly fixture?: AdmittedCanaryFixture;
}): Promise<{
  readonly steps: AdmittedCanaryStepResult[];
  readonly converged: boolean;
}> {
  const fixture = input.fixture ?? ADMITTED_CANARY_FIXTURE;
  if (!isAdmittedCanaryEmail(fixture.email)) {
    throw new AdmittedCanaryGuardError('Fixture email is not the canary');
  }
  let state = await readAdmittedCanaryState(fixture);
  const results: AdmittedCanaryStepResult[] = [];
  const initial = planAdmittedCanary(state, fixture);

  if (!input.apply) {
    const at = new Date().toISOString();
    return {
      steps: initial.map(step => ({
        ...step,
        startedAt: at,
        endedAt: at,
        outcome: step.action === 'ok' ? 'skipped' : 'planned',
      })),
      converged: initial.every(step => step.action === 'ok'),
    };
  }

  for (const id of initial.map(step => step.id)) {
    const step = planAdmittedCanary(state, fixture).find(s => s.id === id);
    const startedAt = new Date().toISOString();
    if (!step) break;
    if (step.action === 'ok') {
      results.push({
        ...step,
        startedAt,
        endedAt: startedAt,
        outcome: 'skipped',
      });
      continue;
    }
    if (step.action === 'blocked' || (id === 'user' && !state.user)) {
      results.push({
        ...step,
        startedAt,
        endedAt: startedAt,
        outcome: 'failed',
        error:
          id === 'user'
            ? 'sign the canary in through the product first'
            : step.detail,
      });
      break;
    }
    try {
      if (id === 'waitlist_entry') {
        await insertSignupWaitlistEntry(db, fixture.email);
      } else if (id === 'profile') {
        await createHeldProfile(state, fixture);
      } else if (id === 'waitlist_approval') {
        await approveEntry(state, fixture);
      } else if (id === 'owner_claim') {
        await ensureOwnerClaim(state);
      } else if (id === 'ownership_proof' && state.profile) {
        await verifyAdmittedCanaryOwnership({
          profileId: state.profile.id,
          fixture,
        });
      }
      results.push({
        ...step,
        startedAt,
        endedAt: new Date().toISOString(),
        outcome: 'done',
      });
    } catch (error) {
      results.push({
        ...step,
        startedAt,
        endedAt: new Date().toISOString(),
        outcome: 'failed',
        error: error instanceof Error ? error.message : 'unknown',
      });
      break;
    }
    state = await readAdmittedCanaryState(fixture);
  }

  const final = planAdmittedCanary(state, fixture);
  return {
    steps: results,
    converged: final.every(step => step.action === 'ok'),
  };
}

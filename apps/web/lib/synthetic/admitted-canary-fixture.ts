import { normalizeEmail } from '@/lib/utils/email';
import {
  ADMITTED_CANARY_RESERVED_ARTIST,
  type ProdcertArtistFixture,
} from './prodcert-artist-fixture';

/**
 * Admitted production canary (golden-path certification, 2026-10-31).
 *
 * Every other production canary is either a returning creator with no
 * artist proof (`browse-ready+clerk_test@jov.ie`) or a per-run new user the
 * admission gate waitlists, so no certification walk could ever show
 * "profile live". This fixture is the one permanent, admitted identity that
 * owns a real shared-pool artist's public data.
 *
 * Declarative and versioned: `scripts/admitted-canary-reconcile.ts` brings
 * production to this spec through product code (`approveWaitlistEntryInTx`,
 * `decideClaimVerification`) and writes a `jovie.admitted-canary-receipt/v1`.
 * Bump `version` whenever the desired state changes.
 *
 * The address is on jov.ie, a Jovie-controlled mailbox, so nothing the
 * product sends it reaches a real person, and `isInternalOrTestAccountEmail`
 * keeps it out of customer metrics (jov.ie domain and the `+canary` tag).
 */

export const ADMITTED_CANARY_FIXTURE_SCHEMA = 'jovie.admitted-canary/v1';
export const ADMITTED_CANARY_RECEIPT_SCHEMA =
  'jovie.admitted-canary-receipt/v1';

/** Recorded as `decidedBy` on the ownership decision and in the audit row. */
export const ADMITTED_CANARY_ACTOR = 'system_admitted_canary';

export interface AdmittedCanaryFixture {
  readonly schema: typeof ADMITTED_CANARY_FIXTURE_SCHEMA;
  readonly version: number;
  readonly email: string;
  readonly handle: string;
  readonly displayName: string;
  readonly artist: ProdcertArtistFixture;
  /** Waitlist status the reconciler approves to. `approved` sends no invite. */
  readonly waitlistTargetStatus: 'approved';
}

export const ADMITTED_CANARY_FIXTURE: AdmittedCanaryFixture = Object.freeze({
  schema: ADMITTED_CANARY_FIXTURE_SCHEMA,
  version: 1,
  email: 'browse-ready+canary-admitted@jov.ie',
  // `unmarkedpavement` is held by a waitlisted per-run prodcert canary from
  // before the artist left the shared pool; never take another row's handle.
  handle: 'unmarked-pavement',
  displayName: ADMITTED_CANARY_RESERVED_ARTIST.name,
  artist: ADMITTED_CANARY_RESERVED_ARTIST,
  waitlistTargetStatus: 'approved',
});

/**
 * Exact-address match. Never a pattern: this predicate gates the canary-only
 * ownership path, so a near miss (`+canary-admitted2`, another domain, a
 * different tag) must never qualify.
 */
export function isAdmittedCanaryEmail(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  return normalizeEmail(email) === ADMITTED_CANARY_FIXTURE.email;
}

/**
 * Test-account profiles that must stay publicly viewable by URL even when
 * test profiles are hidden from public pages. Discovery (search, sitemap)
 * still excludes them. The hide rule must exempt exactly these handles.
 */
export const PUBLIC_VIEW_ALLOWLISTED_CANARY_HANDLES: readonly string[] =
  Object.freeze([ADMITTED_CANARY_FIXTURE.handle]);

export function isPublicViewAllowlistedCanaryHandle(
  handle: string | null | undefined
): boolean {
  if (!handle) return false;
  return PUBLIC_VIEW_ALLOWLISTED_CANARY_HANDLES.includes(
    handle.trim().toLowerCase()
  );
}

export class AdmittedCanaryGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdmittedCanaryGuardError';
  }
}

export interface AdmittedCanaryOwnershipRow {
  readonly handle: string;
  readonly spotifyId: string | null;
  readonly ownerEmail: string | null;
  readonly settings: unknown;
}

/** Exported for tests: every guard runs before any write. */
export function assertAdmittedCanaryOwnershipEligible(
  row: AdmittedCanaryOwnershipRow | null,
  fixture: AdmittedCanaryFixture = ADMITTED_CANARY_FIXTURE
): asserts row is AdmittedCanaryOwnershipRow {
  if (!row) {
    throw new AdmittedCanaryGuardError('Profile has no bound owner');
  }
  if (
    !isAdmittedCanaryEmail(row.ownerEmail) ||
    fixture.email !== ADMITTED_CANARY_FIXTURE.email
  ) {
    throw new AdmittedCanaryGuardError(
      'Owner is not the admitted canary address'
    );
  }
  if (row.handle !== fixture.handle) {
    throw new AdmittedCanaryGuardError('Profile handle is not the fixture');
  }
  if (row.spotifyId !== fixture.artist.spotifyId) {
    throw new AdmittedCanaryGuardError('Profile artist is not the fixture');
  }
}

// ---------------------------------------------------------------------------
// Plan: observed production state -> ordered steps. Pure, so the reconciler's
// dry run and its apply path share one decision and the tests cover both.
// ---------------------------------------------------------------------------

export interface AdmittedCanaryObservedState {
  readonly user: {
    readonly id: string;
    readonly waitlistEntryId: string | null;
    readonly userStatus: string | null;
  } | null;
  readonly waitlistEntry: {
    readonly id: string;
    readonly status: string;
  } | null;
  /** The fixture's profile (bound to the user or held by the entry). */
  readonly profile: {
    readonly id: string;
    readonly handle: string;
    readonly spotifyId: string | null;
    readonly userId: string | null;
    readonly waitlistEntryId: string | null;
    readonly isClaimed: boolean;
    readonly isPublic: boolean;
    readonly claimVerificationStatus: string | null;
    readonly proofOnly: boolean;
  } | null;
  readonly ownerClaimRow: boolean;
  /** Another profile already holds the fixture handle. */
  readonly handleHeldByOther: boolean;
  /** Another profile already holds the fixture's Spotify identity. */
  readonly artistHeldByOther: boolean;
}

export type AdmittedCanaryStepId =
  | 'user'
  | 'waitlist_entry'
  | 'profile'
  | 'waitlist_approval'
  | 'owner_claim'
  | 'ownership_proof';

export type AdmittedCanaryStepAction = 'ok' | 'create' | 'apply' | 'blocked';

export interface AdmittedCanaryStep {
  readonly id: AdmittedCanaryStepId;
  readonly action: AdmittedCanaryStepAction;
  readonly detail: string;
}

const APPROVED_WAITLIST_STATUSES = new Set(['approved', 'invited', 'claimed']);
const PENDING_WAITLIST_STATUSES = new Set(['new', 'waitlisted', 'expired']);

export function planAdmittedCanary(
  state: AdmittedCanaryObservedState,
  fixture: AdmittedCanaryFixture = ADMITTED_CANARY_FIXTURE
): AdmittedCanaryStep[] {
  const steps: AdmittedCanaryStep[] = [];

  steps.push(
    state.user
      ? { id: 'user', action: 'ok', detail: `user ${state.user.id}` }
      : {
          id: 'user',
          action: 'create',
          detail: 'sign in through Better Auth email OTP (product path)',
        }
  );

  steps.push(
    state.waitlistEntry
      ? {
          id: 'waitlist_entry',
          action: 'ok',
          detail: `entry ${state.waitlistEntry.id} (${state.waitlistEntry.status})`,
        }
      : {
          id: 'waitlist_entry',
          action: 'create',
          detail: 'insertSignupWaitlistEntry',
        }
  );

  const profile = state.profile;
  if (!profile) {
    if (state.handleHeldByOther || state.artistHeldByOther) {
      steps.push({
        id: 'profile',
        action: 'blocked',
        detail: state.handleHeldByOther
          ? `handle ${fixture.handle} is held by another profile`
          : `Spotify ${fixture.artist.spotifyId} is held by another profile`,
      });
      return steps;
    }
    steps.push({
      id: 'profile',
      action: 'create',
      detail: `hold ${fixture.handle} for ${fixture.artist.name} on the waitlist entry`,
    });
  } else if (
    profile.handle !== fixture.handle ||
    profile.spotifyId !== fixture.artist.spotifyId
  ) {
    steps.push({
      id: 'profile',
      action: 'blocked',
      detail: `profile ${profile.id} drifted (${profile.handle}, ${profile.spotifyId ?? 'no artist'})`,
    });
    return steps;
  } else {
    steps.push({
      id: 'profile',
      action: 'ok',
      detail: `profile ${profile.id}`,
    });
  }

  const entryStatus = state.waitlistEntry?.status ?? 'waitlisted';
  const approved =
    APPROVED_WAITLIST_STATUSES.has(entryStatus) &&
    profile?.isClaimed === true &&
    profile.userId === state.user?.id;
  if (approved) {
    steps.push({
      id: 'waitlist_approval',
      action: 'ok',
      detail: `entry ${entryStatus}, profile claimed`,
    });
  } else if (
    PENDING_WAITLIST_STATUSES.has(entryStatus) ||
    !state.waitlistEntry
  ) {
    steps.push({
      id: 'waitlist_approval',
      action: 'apply',
      detail: `approveWaitlistEntryInTx -> ${fixture.waitlistTargetStatus} (no invite)`,
    });
  } else {
    steps.push({
      id: 'waitlist_approval',
      action: 'blocked',
      detail: `entry status ${entryStatus} is not approvable`,
    });
    return steps;
  }

  steps.push(
    state.ownerClaimRow
      ? { id: 'owner_claim', action: 'ok', detail: 'owner claim row present' }
      : {
          id: 'owner_claim',
          action: 'create',
          detail: 'user_profile_claims owner row',
        }
  );

  const verified =
    profile?.claimVerificationStatus === 'verified' && profile.isPublic;
  steps.push(
    verified
      ? { id: 'ownership_proof', action: 'ok', detail: 'verified and public' }
      : {
          id: 'ownership_proof',
          action: 'apply',
          detail:
            'verifyAdmittedCanaryOwnership -> decideClaimVerification(approve)',
        }
  );

  return steps;
}

export function isAdmittedCanaryConverged(
  steps: readonly AdmittedCanaryStep[]
): boolean {
  return steps.every(step => step.action === 'ok');
}

export interface AdmittedCanaryReceipt {
  readonly schema: typeof ADMITTED_CANARY_RECEIPT_SCHEMA;
  readonly fixtureSchema: typeof ADMITTED_CANARY_FIXTURE_SCHEMA;
  readonly fixtureVersion: number;
  readonly mode: 'dry-run' | 'apply';
  readonly prodSha: string | null;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly identity: {
    readonly email: string;
    readonly handle: string;
    readonly spotifyId: string;
  };
  readonly steps: readonly (AdmittedCanaryStep & {
    readonly startedAt: string;
    readonly endedAt: string;
    readonly outcome: 'planned' | 'done' | 'skipped' | 'failed';
  })[];
  readonly converged: boolean;
}

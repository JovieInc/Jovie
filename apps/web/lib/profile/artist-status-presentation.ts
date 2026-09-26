/**
 * Artist status presentation mapping (JOV-6553).
 *
 * Deterministic, evidence-backed mapping from identity facts to user-facing
 * copy and actions. Core principle: an imported listing is not artist
 * participation, an unclaimed artist is not necessarily an available handle,
 * and only a real, enforced handle reservation may say "Reserved".
 *
 * Approved copy contract (Tim, 2026-09-23):
 *  - Eligible public listing without management authorization → "Jovie listing"
 *    with an explainer that artist/team management is not verified.
 *  - Provider-backed identity with an ENFORCED handle reservation for that
 *    identity → "@handle — Reserved for this artist" (reserved FOR, not BY).
 *  - Handle assigned elsewhere or policy-blocked → "Unavailable" (no private
 *    ownership or moderation details).
 *  - Genuinely open after authoritative checks → "Available". Never inferred
 *    from `!isClaimed`.
 *  - Availability source fails / unknown → "We couldn't check this handle.
 *    Try again." Never a false Available/Reserved state.
 *  - Authorized and published artist profile → "Artist-managed" or "Managed by
 *    the artist's team" as actual authorization supports.
 *
 * Every expected truth in the accompanying tests is authored from this
 * contract, not from the mapper's implementation.
 */

export type ArtistManagementEvidence =
  /** A live ownership claim row with owner/manager role (userProfileClaims). */
  | 'owner_claim'
  | 'manager_claim'
  /**
   * `isClaimed === true` or any signup/payment/import signal WITHOUT a
   * verified ownership claim. Never earns Artist-managed on its own.
   */
  | 'claimed_flag_only'
  /** No authorization evidence at all (unknown / imported record). */
  | 'none';

export type ArtistPublicationEvidence =
  | /** Published public profile. */ 'published'
  /** Unpublished / draft / private record. */
  | 'unpublished';

export type HandleReservationEvidence =
  /**
   * A reservation exists AND the backend prevents unauthorized allocation to
   * anyone else AND it is bound to this specific identity.
   */
  | 'enforced_reservation'
  /** No reservation mechanism, or the reservation cannot be verified. */
  | 'none';

export type HandleAvailabilityEvidence =
  | /** Authoritative check confirmed the handle is open. */ 'available'
  /** Authoritative check found the handle assigned or policy-blocked. */
  | 'assigned_or_blocked'
  /** Authoritative check could not run or returned unknown. */
  | 'unknown';

export type ArtistStatusPresentation = {
  /** Short status label (badge / pill / line). */
  readonly label: string;
  /**
   * One-line truthful explainer for the state, or null when the label alone
   * is complete. Never invents a negative claim the evidence cannot support.
   */
  readonly explanation: string | null;
  /**
   * The single supported action, or null when no action is truthful here.
   * Actions only ever route through existing preview/verification flows;
   * selection never grants ownership.
   */
  readonly action: 'view_listing' | 'continue_setup' | 'try_again' | null;
};

const LISTING_LABEL = 'Jovie listing';
const LISTING_EXPLANATION =
  'Listed from public music data. Artist or team management hasn’t been verified.';
const LISTING_EXPLANATION_JOVIE_CREATED =
  'Not managed by the artist or their team.';
const RESERVED_EXPLANATION =
  'We found this artist’s public information. The handle is reserved for the artist or their authorized team. Let’s build your preview, then verify that you can manage it.';

function presentReservedForArtist(): ArtistStatusPresentation {
  return {
    action: 'continue_setup',
    explanation: RESERVED_EXPLANATION,
    label: 'Reserved for this artist',
  };
}

function presentAvailability(
  availability: HandleAvailabilityEvidence
): ArtistStatusPresentation {
  if (availability === 'available') {
    return {
      action: 'continue_setup',
      explanation: null,
      label: 'Available',
    };
  }

  if (availability === 'assigned_or_blocked') {
    return {
      action: null,
      explanation: null,
      label: 'Unavailable',
    };
  }

  // Unknown availability: never a false Available/Reserved state.
  return {
    action: 'try_again',
    explanation: null,
    label: 'We couldn’t check this handle. Try again.',
  };
}

export type ArtistStatusFacts = {
  readonly management: ArtistManagementEvidence;
  readonly publication: ArtistPublicationEvidence;
  readonly reservation: HandleReservationEvidence;
  readonly availability: HandleAvailabilityEvidence;
};

/**
 * Map evidence facts to the truthful presentation.
 *
 * Priority: authorization evidence first (it outranks listing state), then
 * reservation, then availability. Missing evidence degrades to the truthful
 * neutral state — never to a stronger claim.
 */
export function presentArtistStatus(
  facts: ArtistStatusFacts
): ArtistStatusPresentation {
  const { availability, management, publication, reservation } = facts;

  // --- Authorized management states (require published profile) ----------
  if (
    publication === 'published' &&
    (management === 'owner_claim' || management === 'manager_claim')
  ) {
    return {
      action: 'view_listing',
      explanation: null,
      label:
        management === 'owner_claim'
          ? 'Artist-managed'
          : 'Managed by the artist’s team',
    };
  }

  // A stale/revoked authorization on an unpublished profile shows nothing.
  if (publication === 'unpublished') {
    return {
      action: null,
      explanation: null,
      label: LISTING_LABEL,
    };
  }

  // --- Published listing without verified management ---------------------
  // An imported listing is not artist participation: claimed_flag_only and
  // no-evidence degrade to the truthful listing state — never to a
  // membership, management, or ownership claim — UNLESS an authoritative
  // availability check or enforced reservation provides a stronger truth.
  // Reservation outranks availability; availability outranks the plain
  // listing state.
  if (
    (management === 'claimed_flag_only' || management === 'none') &&
    reservation === 'enforced_reservation'
  ) {
    return presentReservedForArtist();
  }

  if (
    (management === 'claimed_flag_only' || management === 'none') &&
    availability !== 'unknown'
  ) {
    return presentAvailability(availability);
  }

  if (management === 'claimed_flag_only' || management === 'none') {
    return presentUnmanagedListing();
  }

  // Unreachable with the current evidence union — every management value is
  // handled above. Present the plain listing rather than guessing.
  return presentUnmanagedListing();
}

/**
 * Presentation for an eligible public listing without verified management —
 * the truthful replacement for the misleading "On Jovie" membership badge.
 *
 * When Jovie itself created the record and it was never authorized, the
 * stronger (still truthful) explainer may be used.
 */
export function presentUnmanagedListing(options?: {
  /** Jovie-created record never authorized by the artist/team. */
  readonly jovieCreated?: boolean;
}): ArtistStatusPresentation {
  return {
    action: 'view_listing',
    explanation: options?.jovieCreated
      ? LISTING_EXPLANATION_JOVIE_CREATED
      : LISTING_EXPLANATION,
    label: LISTING_LABEL,
  };
}

/**
 * Guard for action routing: expose a public listing action only when an
 * eligible public destination exists. Never expose private/draft records.
 */
export function canViewListing(facts: {
  readonly publication: ArtistPublicationEvidence;
}): boolean {
  return facts.publication === 'published';
}

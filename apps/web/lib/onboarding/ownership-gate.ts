/**
 * Server-side ownership gate for onboarding claim / handle reservation.
 *
 * Fail closed: unauthenticated callers and non-owners never get
 * reserved / locked-in / "manage as owner" success outcomes.
 *
 * Pure helpers (no DB) so unit tests can import without server-only plumbing.
 */

export type OnboardingOwnershipErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND';

export class OnboardingOwnershipError extends Error {
  readonly code: OnboardingOwnershipErrorCode;
  readonly status: 401 | 403 | 404;
  readonly errorCode: OnboardingOwnershipErrorCode;

  constructor(code: OnboardingOwnershipErrorCode, message: string) {
    super(message);
    this.name = 'OnboardingOwnershipError';
    this.code = code;
    this.errorCode = code;
    this.status =
      code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : 404;
  }
}

export function isOnboardingOwnershipError(
  error: unknown
): error is OnboardingOwnershipError {
  return error instanceof OnboardingOwnershipError;
}

/**
 * Require a non-empty authenticated app `users.id` before any claim,
 * materialize, or handle-reservation success path.
 */
export function assertAuthenticatedOnboardingUser(
  userId: string | null | undefined
): asserts userId is string {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new OnboardingOwnershipError(
      'UNAUTHORIZED',
      'Sign in is required before this artist profile can be reserved.'
    );
  }
}

/**
 * Refuse "manage as owner" outcomes when the profile row is not owned by the
 * authenticated user. Unowned / null owner fails closed (not auto-claimed).
 */
export function assertOnboardingProfileOwner(params: {
  readonly authenticatedUserId: string | null | undefined;
  readonly profileOwnerUserId: string | null | undefined;
}): void {
  assertAuthenticatedOnboardingUser(params.authenticatedUserId);
  const ownerId =
    typeof params.profileOwnerUserId === 'string'
      ? params.profileOwnerUserId.trim()
      : '';
  if (!ownerId || ownerId !== params.authenticatedUserId) {
    throw new OnboardingOwnershipError(
      'FORBIDDEN',
      'Only the verified owner can manage this artist profile.'
    );
  }
}

/**
 * Verify the onboarding conversation is attached to the authenticated user
 * before materializing a claimed public profile / reserved handle.
 */
export function assertConversationOwnedByUser(params: {
  readonly authenticatedUserId: string | null | undefined;
  readonly conversationUserId: string | null | undefined;
  readonly conversationExists: boolean;
}): void {
  assertAuthenticatedOnboardingUser(params.authenticatedUserId);
  if (!params.conversationExists) {
    throw new OnboardingOwnershipError(
      'NOT_FOUND',
      'Onboarding conversation not found.'
    );
  }
  const conversationUserId =
    typeof params.conversationUserId === 'string'
      ? params.conversationUserId.trim()
      : '';
  if (
    !conversationUserId ||
    conversationUserId !== params.authenticatedUserId
  ) {
    throw new OnboardingOwnershipError(
      'FORBIDDEN',
      'Only the verified owner can reserve a handle for this artist profile.'
    );
  }
}

/**
 * Combined entry used by materialize / reserve success paths.
 * Requires auth + conversation ownership (when a conversation is in scope).
 */
export function requireVerifiedOwnerForReservation(params: {
  readonly userId: string | null | undefined;
  readonly conversationUserId?: string | null;
  readonly conversationExists?: boolean;
}): { readonly userId: string } {
  assertAuthenticatedOnboardingUser(params.userId);

  if (params.conversationExists !== undefined) {
    assertConversationOwnedByUser({
      authenticatedUserId: params.userId,
      conversationUserId: params.conversationUserId,
      conversationExists: params.conversationExists,
    });
  }

  return { userId: params.userId };
}

/**
 * Pre-verify visitor copy must stay neutral ("this artist profile").
 * Only after ownership is verified may we address the visitor as the owner.
 */
export function describeArtistProfileForVisitor(params: {
  readonly ownershipVerified: boolean;
  readonly artistName?: string | null;
}): string {
  const name = params.artistName?.trim() || null;
  if (!params.ownershipVerified) {
    return name ? `this artist profile (${name})` : 'this artist profile';
  }
  return name ? `${name}'s profile` : 'this artist profile';
}

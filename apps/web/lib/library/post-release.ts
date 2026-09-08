import type {
  LibraryPresenceFinding,
  LibraryRightsholderEvidence,
} from '@/lib/db/schema/library-presence';

export type RightsholderEvidenceValidation =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | 'public_registry_must_be_observed'
        | 'invalid_share'
        | 'attestation_source_mismatch';
    };

export function validateRightsholderEvidence(
  evidence: Pick<
    LibraryRightsholderEvidence,
    'evidenceClass' | 'source' | 'shareBps'
  >
): RightsholderEvidenceValidation {
  if (
    (evidence.source === 'songview' || evidence.source === 'mlc') &&
    evidence.evidenceClass !== 'observed'
  ) {
    return { ok: false, reason: 'public_registry_must_be_observed' };
  }
  if (
    evidence.evidenceClass === 'attested' &&
    evidence.source !== 'artist_attestation'
  ) {
    return { ok: false, reason: 'attestation_source_mismatch' };
  }
  if (
    evidence.shareBps !== null &&
    (evidence.shareBps < 0 || evidence.shareBps > 10_000)
  ) {
    return { ok: false, reason: 'invalid_share' };
  }
  return { ok: true };
}

export function canPublishOwnedDownload(input: {
  readonly isActive: boolean;
  readonly rightsControlAttested: boolean;
}): boolean {
  return input.isActive && input.rightsControlAttested;
}

export type PresenceFindingAction =
  | 'prepare_update'
  | 'not_this_artist'
  | 'not_this_song'
  | 'confirmed_match'
  | 'dismiss';

export type PresenceFindingTransition =
  | {
      readonly ok: true;
      readonly status: LibraryPresenceFinding['status'];
      readonly collisionDisposition:
        | LibraryPresenceFinding['collisionDisposition']
        | null;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'already_terminal'
        | 'draft_missing'
        | 'not_a_collision'
        | 'wrong_collision_action';
    };

export type PresenceActionFailureReason =
  | 'not_found'
  | Extract<PresenceFindingTransition, { readonly ok: false }>['reason'];

export function presenceActionFailureStatus(
  reason: PresenceActionFailureReason
): 404 | 409 {
  return reason === 'not_found' ? 404 : 409;
}

export function transitionPresenceFinding(
  finding: Pick<
    LibraryPresenceFinding,
    'kind' | 'actionMode' | 'draftRequest' | 'status'
  >,
  action: PresenceFindingAction
): PresenceFindingTransition {
  if (finding.status === 'resolved' || finding.status === 'dismissed') {
    return { ok: false, reason: 'already_terminal' };
  }
  if (action === 'prepare_update') {
    if (finding.kind === 'collision') {
      return { ok: false, reason: 'wrong_collision_action' };
    }
    if (
      finding.actionMode === 'draft_request' &&
      !finding.draftRequest?.trim()
    ) {
      return { ok: false, reason: 'draft_missing' };
    }
    return {
      ok: true,
      status:
        finding.actionMode === 'draft_request'
          ? 'drafted'
          : finding.actionMode === 'direct_update'
            ? 'resolved'
            : finding.status,
      collisionDisposition: null,
    };
  }
  if (action === 'dismiss') {
    return { ok: true, status: 'dismissed', collisionDisposition: null };
  }
  if (finding.kind !== 'collision') {
    return { ok: false, reason: 'not_a_collision' };
  }
  if (
    action !== 'not_this_artist' &&
    action !== 'not_this_song' &&
    action !== 'confirmed_match'
  ) {
    return { ok: false, reason: 'wrong_collision_action' };
  }
  return {
    ok: true,
    status: action === 'confirmed_match' ? 'resolved' : 'dismissed',
    collisionDisposition: action,
  };
}

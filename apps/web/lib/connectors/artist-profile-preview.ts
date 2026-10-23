import {
  ARTIST_PROFILE_FIELDS,
  type ArtistProfileContract,
  type ArtistProfileField,
} from './artist-profile-contract';
import {
  type ArtistProfilePreviewManifest,
  artistProfilePreviewManifestSchema,
  type ProfileImageEvidence,
  profileFieldObservationSchema,
  profileImageEvidenceSchema,
  profilePreviewTimeSchema,
} from './artist-profile-preview-manifest';
import type {
  ArtistProfileFieldValue,
  ArtistProfileSnapshot,
} from './artist-profile-snapshot.server';
import {
  type ProfileValidationResult,
  validateArtistProfileValue,
} from './artist-profile-value-validation';
import { digest, type ProfileDestination } from './profile-writes/contract';

type FieldPolicy = ArtistProfileContract['fields'][ArtistProfileField];
export type ProfilePreviewBlocker =
  | 'authorization_required'
  | 'canonical_unavailable'
  | 'destination_mismatch'
  | 'evidence_unmet'
  | 'execution_limits_unknown'
  | 'invalid_manifest'
  | 'invalid_selection'
  | 'invalid_target'
  | 'invalid_time'
  | 'invalid_value'
  | 'missing_scopes'
  | 'rollback_snapshot_missing'
  | 'terms_evidence_stale'
  | 'unsupported_field';

export interface ProfileFieldObservation {
  readonly value: string | null;
  readonly version: string;
  readonly observedAt: string;
}
export interface ArtistProfilePreviewInput {
  readonly snapshot: ArtistProfileSnapshot;
  /** Parse the manifest at this boundary, including cross-policy invariants. */
  readonly manifest: unknown;
  readonly target: ProfileDestination;
  readonly selectedFields: readonly string[];
  /** Caller must obtain this verified context from the existing connection. */
  readonly authorization: {
    readonly target: ProfileDestination;
    readonly scopes: readonly string[];
    readonly role: 'owner' | 'manager' | 'unknown';
  };
  /** Verified evidence references, not arbitrary provider payloads. */
  readonly evidenceRefs: readonly string[];
  readonly imageEvidence?: unknown;
  readonly destination?: {
    readonly target: ProfileDestination;
    readonly fields: Readonly<
      Partial<Record<ArtistProfileField, ProfileFieldObservation>>
    >;
  };
  /** Explicit clock input makes repeated previews deterministic. */
  readonly now: string;
}
export interface ArtistProfileFieldPreview {
  readonly field: string;
  readonly canonical: ArtistProfileFieldValue | null;
  readonly outboundValue: string | null;
  readonly destination: ProfileFieldObservation | null;
  readonly validation: readonly ProfileValidationResult[];
  readonly warnings: readonly string[];
  readonly blockers: readonly ProfilePreviewBlocker[];
  readonly requiredAuthorization: FieldPolicy['authorization']['write'] | null;
  readonly confirmation: {
    readonly policy: FieldPolicy['confirmation'] | null;
    readonly status: 'required';
    readonly checksum: string;
  };
  readonly evidence: {
    readonly policy: FieldPolicy['evidence'] | null;
    readonly requiredRefs: readonly string[];
    readonly missingRefs: readonly string[];
    readonly image: ProfileImageEvidence | null;
  };
  readonly rollback: FieldPolicy['rollback'] | null;
}
export interface ArtistProfilePreview {
  readonly status: 'blocked' | 'confirmable';
  readonly checksum: string;
  readonly profileId: string;
  readonly profileRevision: string;
  readonly manifestVersion: string | null;
  readonly target: ProfileDestination;
  readonly selectedFields: readonly string[];
  readonly blockers: readonly ProfilePreviewBlocker[];
  readonly fields: readonly ArtistProfileFieldPreview[];
}

function sameTarget(
  left: ProfileDestination,
  right: ProfileDestination
): boolean {
  return (
    left.providerId === right.providerId &&
    left.connectorAccountId === right.connectorAccountId &&
    left.destinationAccountId === right.destinationAccountId
  );
}
function isField(field: string): field is ArtistProfileField {
  return ARTIST_PROFILE_FIELDS.some(name => name === field);
}
function hasAuthorization(
  policy: FieldPolicy['authorization']['read'],
  input: ArtistProfilePreviewInput
): boolean {
  if (policy.status === 'public') return true;
  return (
    policy.status === 'verified' &&
    sameTarget(input.target, input.authorization.target) &&
    (input.authorization.role === 'owner' ||
      (policy.requiredRole === 'owner_or_manager' &&
        input.authorization.role === 'manager')) &&
    policy.requiredScopes.every(scope =>
      input.authorization.scopes.includes(scope)
    )
  );
}

function planField(
  field: string,
  input: ArtistProfilePreviewInput,
  manifest: ArtistProfilePreviewManifest | null
): Omit<ArtistProfileFieldPreview, 'confirmation'> {
  const canonical = isField(field) ? input.snapshot.fields[field] : null;
  const policy =
    manifest && isField(field) ? manifest.artistProfile.fields[field] : null;
  const blockers: ProfilePreviewBlocker[] = [];
  const warnings: string[] = [];
  const requiredRefs: string[] = [];
  const validation =
    manifest && isField(field)
      ? validateArtistProfileValue(
          field,
          canonical?.value ?? null,
          manifest,
          input.imageEvidence,
          input.evidenceRefs
        )
      : { outboundValue: null, results: [] };
  let destination: ProfileFieldObservation | null = null;
  if (!isField(field) || policy?.write !== 'supported')
    blockers.push('unsupported_field');
  if (isField(field) && canonical?.status !== 'available')
    blockers.push('canonical_unavailable');
  if (validation.results.some(result => !result.valid))
    blockers.push('invalid_value');
  if (policy && manifest) {
    const auth = policy.authorization.write;
    if (auth.status !== 'verified' || !hasAuthorization(auth, input))
      blockers.push('authorization_required');
    if (auth.status === 'verified') {
      requiredRefs.push(auth.evidenceRef);
      if (
        auth.requiredScopes.some(
          scope => !input.authorization.scopes.includes(scope)
        )
      )
        blockers.push('missing_scopes');
    }
    const terms = policy.termsApi;
    const evidence =
      terms.status === 'approved'
        ? manifest.termsEvidence[terms.evidenceRef]
        : null;
    const now = Date.parse(input.now);
    if (
      !evidence ||
      !(
        Date.parse(evidence.reviewedAt) <= now &&
        now < Date.parse(evidence.expiresAt)
      )
    ) {
      blockers.push('terms_evidence_stale');
    }
    if (terms.status === 'approved') requiredRefs.push(terms.evidenceRef);
    if (
      manifest.execution.status !== 'documented' ||
      policy.rateLimit.status !== 'documented'
    ) {
      blockers.push('execution_limits_unknown');
    }
    if (policy.evidence.status === 'documented')
      requiredRefs.push(...policy.evidence.refs);
    else blockers.push('evidence_unmet');
    if ('evidenceRef' in policy.rollback)
      requiredRefs.push(policy.rollback.evidenceRef);
    const readAuth = policy.authorization.read;
    const observation = profileFieldObservationSchema.safeParse(
      isField(field) ? input.destination?.fields[field] : null
    );
    const observed = observation.success ? observation.data : null;
    const readAllowed =
      policy.read === 'supported' && hasAuthorization(readAuth, input);
    if (
      observed &&
      input.destination &&
      !sameTarget(input.destination.target, input.target)
    ) {
      blockers.push('destination_mismatch');
    } else if (
      readAllowed &&
      observed &&
      Date.parse(observed.observedAt) <= now
    ) {
      if ('evidenceRef' in readAuth) requiredRefs.push(readAuth.evidenceRef);
      destination = { ...observed };
    }
    if (!destination) warnings.push('destination_value_unavailable');
    if (
      policy.read === 'supported' &&
      readAuth.status === 'verified' &&
      readAuth.requiredScopes.some(
        scope => !input.authorization.scopes.includes(scope)
      )
    ) {
      blockers.push('missing_scopes');
    }
    if (policy.rollback.mode === 'snapshot_restore' && !destination)
      blockers.push('rollback_snapshot_missing');
    if (policy.rollback.mode === 'unsupported')
      warnings.push('rollback_unsupported');
    if (policy.rollback.mode === 'compensating_write')
      warnings.push('rollback_requires_compensating_write');
  }
  if (
    canonical?.value !== validation.outboundValue &&
    validation.outboundValue !== null
  )
    warnings.push('value_transformed');
  const image =
    field === 'image'
      ? profileImageEvidenceSchema.safeParse(input.imageEvidence)
      : null;
  if (image?.success) requiredRefs.push(image.data.evidenceRef);
  const refs = [...new Set(requiredRefs)].sort();
  const missingRefs = refs.filter(ref => !input.evidenceRefs.includes(ref));
  if (missingRefs.length) blockers.push('evidence_unmet');
  return {
    field,
    canonical,
    outboundValue: validation.outboundValue,
    destination,
    validation: validation.results,
    warnings,
    blockers: [...new Set(blockers)].sort(),
    requiredAuthorization: policy?.authorization.write ?? null,
    evidence: {
      policy: policy?.evidence ?? null,
      requiredRefs: refs,
      missingRefs,
      image: image?.success ? image.data : null,
    },
    rollback: policy?.rollback ?? null,
  };
}

/**
 * Pure planning only. A confirmable preview is not a write authorization or receipt.
 * Execution must revalidate revision, manifest, account, evidence and confirmation.
 */
export function previewArtistProfileChanges(
  input: ArtistProfilePreviewInput
): ArtistProfilePreview {
  const parsed = artistProfilePreviewManifestSchema.safeParse(input.manifest);
  const manifest = parsed.success ? parsed.data : null;
  const selectedFields = [...new Set(input.selectedFields)].sort();
  const blockers: ProfilePreviewBlocker[] = [];
  if (!manifest) blockers.push('invalid_manifest');
  if (
    !selectedFields.length ||
    selectedFields.length !== input.selectedFields.length
  )
    blockers.push('invalid_selection');
  if (
    Object.values(input.target).some(
      value => typeof value !== 'string' || !value.trim()
    ) ||
    !input.target.providerId ||
    !input.target.connectorAccountId ||
    !input.target.destinationAccountId
  )
    blockers.push('invalid_target');
  if (manifest && manifest.providerId !== input.target.providerId)
    blockers.push('destination_mismatch');
  if (!profilePreviewTimeSchema.safeParse(input.now).success)
    blockers.push('invalid_time');
  const plans = selectedFields.map(field => {
    const plan = planField(field, input, manifest);
    return {
      ...plan,
      blockers: [...new Set([...blockers, ...plan.blockers])].sort(),
    };
  });
  // Include policy contents as well as version: changing rules without a version bump
  // invalidates confirmation too. Sort fields before hashing; values remain exact.
  const checksum = digest({
    schema: 'artist-profile-preview/v1',
    profileId: input.snapshot.profileId,
    profileRevision: input.snapshot.revision,
    profileEditVersion: input.snapshot.profileEditVersion,
    manifest,
    target: input.target,
    selectedFields,
    fields: plans,
    blockers: blockers.sort(),
  });
  const fields = plans.map(plan => ({
    ...plan,
    confirmation: {
      policy:
        manifest && isField(plan.field)
          ? manifest.artistProfile.fields[plan.field].confirmation
          : null,
      status: 'required' as const,
      checksum,
    },
  }));
  const allBlockers = [
    ...new Set([...blockers, ...fields.flatMap(field => field.blockers)]),
  ].sort();
  return {
    status: allBlockers.length ? 'blocked' : 'confirmable',
    checksum,
    profileId: input.snapshot.profileId,
    profileRevision: input.snapshot.revision,
    manifestVersion: manifest?.version ?? null,
    target: { ...input.target },
    selectedFields,
    blockers: allBlockers,
    fields,
  };
}

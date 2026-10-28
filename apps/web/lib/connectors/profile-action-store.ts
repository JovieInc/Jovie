import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { externalObjects, suggestedActions } from '@/lib/db/schema/connectors';
import {
  type ProfileActionKind,
  type ProfileActionProposal,
  parseProfileAction,
  profileActionConfirmationSchema,
  profileActionKindSchema,
  profileActionPayloadSchema,
  profileActionProposalSchema,
  profileActionValuesSchema,
  profilePreviewChecksum,
} from './profile-action';
import {
  loadProfileActionState,
  ProfileActionError,
} from './profile-action-state';
import { digest } from './profile-writes/contract';
import {
  PROFILE_ACCEPT_OBSERVATION_KIND,
  PROFILE_WRITE_DESTINATION_KIND,
} from './suggested-action-kinds';

export { ProfileActionError } from './profile-action-state';

async function observationState(
  id: string,
  target: ProfileActionProposal['target']
) {
  const [observation] = await db
    .select({ payload: externalObjects.payload })
    .from(externalObjects)
    .where(
      and(
        eq(externalObjects.id, id),
        eq(externalObjects.connectorAccountId, target.connectorAccountId),
        eq(externalObjects.provider, target.provider)
      )
    )
    .limit(1);
  if (!observation)
    throw new ProfileActionError('profile-action-observation-unavailable');
  return {
    id,
    checksum: digest(observation.payload),
    payload: observation.payload,
  };
}

/** Internal detector entry point; caller supplies the authenticated application user. */
export async function proposeProfileAction(input: {
  userId: string;
  kind: ProfileActionKind;
  creatorProfileId: string;
  connectorAccountId: string;
  values: ProfileActionProposal['values'];
  observationId?: string;
  evidenceRefs: string[];
  rationale: string;
}) {
  const kind = profileActionKindSchema.parse(input.kind);
  const values = profileActionValuesSchema.parse(input.values);
  const fields = Object.keys(values) as ProfileActionProposal['fields'];
  if (!fields.length)
    throw new ProfileActionError('profile-action-empty-fields', 422);
  const state = await loadProfileActionState({ ...input, kind, fields });
  if (
    kind === PROFILE_WRITE_DESTINATION_KIND &&
    fields.some(field => values[field] !== state.values[field])
  ) {
    throw new ProfileActionError('profile-action-values-not-canonical', 422);
  }
  if (
    (kind === PROFILE_ACCEPT_OBSERVATION_KIND) !==
    Boolean(input.observationId)
  ) {
    throw new ProfileActionError('profile-action-observation-required', 422);
  }
  const observation = input.observationId
    ? await observationState(input.observationId, state.target)
    : null;
  const proposal = profileActionProposalSchema.parse({
    schemaVersion: 1,
    creatorProfileId: input.creatorProfileId,
    target: state.target,
    fields,
    values,
    canonicalRevision: state.canonicalRevision,
    manifestVersion: state.manifestVersion,
    observation: observation
      ? { id: observation.id, checksum: observation.checksum }
      : null,
    evidenceRefs: input.evidenceRefs,
    rationale: input.rationale,
    requiredConfirmationMode: 'exact_preview',
  });
  const id = randomUUID();
  const payload = profileActionPayloadSchema.parse({
    proposal,
    previewChecksum: profilePreviewChecksum({
      id,
      userId: input.userId,
      kind,
      proposal,
    }),
    consent: null,
  });
  const [saved] = await db
    .insert(suggestedActions)
    .values({
      id,
      userId: input.userId,
      kind,
      targetConnectorAccountId: state.target.connectorAccountId,
      payload,
      sourceRefs: proposal.evidenceRefs,
      rationale: proposal.rationale,
      idempotencyKey: `profile-action:${id}`,
      sideEffects: [],
      status: 'pending',
    })
    .returning({ id: suggestedActions.id });
  if (!saved) throw new Error('profile-action-not-stored');
  return { id, kind, payload };
}

/** Approval persists consent only. Import/write execution must consume this exact revision. */
export async function approveProfileAction(input: {
  id: string;
  userId: string;
  confirmation: unknown;
}) {
  const confirmation = profileActionConfirmationSchema.safeParse(
    input.confirmation
  );
  if (!confirmation.success)
    throw new ProfileActionError(
      'profile-action-exact-confirmation-required',
      422
    );
  const load = async () => {
    const [row] = await db
      .select({
        id: suggestedActions.id,
        kind: suggestedActions.kind,
        payload: suggestedActions.payload,
        status: suggestedActions.status,
        targetConnectorAccountId: suggestedActions.targetConnectorAccountId,
      })
      .from(suggestedActions)
      .where(
        and(
          eq(suggestedActions.id, input.id),
          eq(suggestedActions.userId, input.userId)
        )
      )
      .limit(1);
    return row;
  };
  const row = await load();
  if (!row) throw new ProfileActionError('not-found', 404);
  const payload = parseProfileAction(row.kind, row.payload);
  const kind = profileActionKindSchema.safeParse(row.kind);
  if (!payload || !kind.success)
    throw new ProfileActionError('invalid-profile-action', 422);
  const { proposal, previewChecksum, consent } = payload;
  if (
    row.targetConnectorAccountId !== proposal.target.connectorAccountId ||
    previewChecksum !==
      profilePreviewChecksum({
        id: input.id,
        userId: input.userId,
        kind: kind.data,
        proposal,
      }) ||
    confirmation.data.previewChecksum !== previewChecksum
  )
    throw new ProfileActionError('profile-action-preview-mismatch');
  // An unchanged retry returns the historical receipt, even if the live profile has since moved on.
  if (
    (row.status === 'approved' || row.status === 'executed') &&
    consent?.actorId === input.userId
  )
    return { approvalId: input.id, status: 'already-approved' };
  if (row.status !== 'pending' || consent)
    throw new ProfileActionError('already-decided');

  const state = await loadProfileActionState({
    userId: input.userId,
    creatorProfileId: proposal.creatorProfileId,
    connectorAccountId: proposal.target.connectorAccountId,
    fields: proposal.fields,
    kind: kind.data,
  });
  if (
    state.canonicalRevision !== proposal.canonicalRevision ||
    state.manifestVersion !== proposal.manifestVersion ||
    digest(state.target) !== digest(proposal.target) ||
    (kind.data === PROFILE_WRITE_DESTINATION_KIND &&
      proposal.fields.some(
        field => proposal.values[field] !== state.values[field]
      ))
  )
    throw new ProfileActionError('profile-action-stale-preview');
  let observationGuard;
  if (proposal.observation) {
    const current = await observationState(
      proposal.observation.id,
      proposal.target
    );
    if (current.checksum !== proposal.observation.checksum)
      throw new ProfileActionError('profile-action-stale-preview');
    observationGuard = drizzleSql`exists (select 1 from ${externalObjects} where ${externalObjects.id} = ${current.id}
      and ${externalObjects.connectorAccountId} = ${proposal.target.connectorAccountId}
      and ${externalObjects.provider} = ${proposal.target.provider}
      and ${externalObjects.payload} = ${JSON.stringify(current.payload)}::jsonb)`;
  }
  const approvedAt = new Date();
  const approvedPayload = {
    ...payload,
    consent: {
      ...confirmation.data,
      actorId: input.userId,
      confirmedAt: approvedAt.toISOString(),
    },
  };
  const updated = await db
    .update(suggestedActions)
    .set({
      status: 'approved',
      approvedAt,
      payload: approvedPayload,
    })
    .where(
      and(
        eq(suggestedActions.id, input.id),
        eq(suggestedActions.userId, input.userId),
        eq(suggestedActions.kind, kind.data),
        eq(suggestedActions.status, 'pending'),
        eq(
          suggestedActions.targetConnectorAccountId,
          proposal.target.connectorAccountId
        ),
        eq(suggestedActions.payload, row.payload),
        state.guard,
        observationGuard
      )
    )
    .returning({ id: suggestedActions.id });
  if (!updated.length) {
    const current = await load();
    // Another approver may have used a different timestamp for the same preview.
    const receipt =
      current && parseProfileAction(current.kind, current.payload);
    if (
      current?.status === 'approved' &&
      receipt &&
      current.targetConnectorAccountId === row.targetConnectorAccountId &&
      digest(receipt.proposal) === digest(proposal) &&
      receipt.consent?.actorId === input.userId &&
      receipt.previewChecksum === previewChecksum
    )
      return { approvalId: input.id, status: 'already-approved' };
    throw new ProfileActionError('profile-action-stale-preview');
  }
  return { approvalId: input.id, status: 'approved' };
}

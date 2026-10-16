import 'server-only';
import { and, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { withDbSessionTx } from '@/lib/auth/session';
import {
  confirmationFor,
  digest,
  type ProfileWriteLedger,
  type ProfileWriteProposal,
} from '@/lib/connectors/profile-writes/contract';
import { getProfileDestination } from '@/lib/connectors/profile-writes/destinations';
import { profileWriteLedger } from '@/lib/connectors/profile-writes/ledger.server';
import { ProfileWriteService } from '@/lib/connectors/profile-writes/service';
import { assertCustomerVoiceFloor } from '@/lib/copy/outbound-floor';
import { db } from '@/lib/db';
import { connectorWriteReceipts } from '@/lib/db/schema/connector-write-receipts';
import { dspBioSyncRequests } from '@/lib/db/schema/dsp-bio-sync';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { ResendEmailProvider } from '@/lib/notifications/providers/resend';
import { createBioSubmissionAdapter } from './adapter';

export interface BioSyncRequest {
  userId: string;
  creatorProfileId: string;
  /** Specific DSP IDs, or all confirmed targets when omitted. */
  providerIds?: string[];
  /** The bio text to push. If omitted, uses the current bio from creator_profiles */
  bioText?: string;
}
export interface BioSyncResult {
  providerId: string;
  status: 'pending' | 'unsupported';
  proposal?: ProfileWriteProposal;
  confirmation?: string;
}
export interface BioSyncResponse {
  success: boolean;
  results: BioSyncResult[];
  pendingCount: number;
}

/** A confirmed match is an email submission target, never an OAuth connection. */
export async function createDspBioWriteService(
  userId: string,
  profileId: string,
  providerId: string
) {
  const load = async () => {
    const [row] = await db
      .select({
        bio: creatorProfiles.bio,
        displayName: creatorProfiles.displayName,
        username: creatorProfiles.username,
        spotifyId: creatorProfiles.spotifyId,
        spotifyUrl: creatorProfiles.spotifyUrl,
        matchId: dspArtistMatches.id,
        externalArtistId: dspArtistMatches.externalArtistId,
        externalArtistUrl: dspArtistMatches.externalArtistUrl,
      })
      .from(creatorProfiles)
      .innerJoin(
        dspArtistMatches,
        eq(dspArtistMatches.creatorProfileId, creatorProfiles.id)
      )
      .where(
        and(
          eq(creatorProfiles.id, profileId),
          eq(creatorProfiles.userId, userId),
          eq(dspArtistMatches.providerId, providerId),
          eq(dspArtistMatches.status, 'confirmed')
        )
      )
      .limit(1);
    if (!row?.externalArtistId) throw new Error('confirmed-target-required');
    return { ...row, externalArtistId: row.externalArtistId };
  };
  const current = await load();
  const destination = {
    creatorProfileId: profileId,
    providerId,
    connectorAccountId: current.matchId,
    destinationAccountId: current.externalArtistId,
  };
  const ledger: ProfileWriteLedger = {
    ...profileWriteLedger,
    async authorize(actor, target, scopes) {
      const context = await load();
      return (
        actor === userId &&
        target.creatorProfileId === profileId &&
        scopes.length === 0 &&
        target.providerId === providerId &&
        target.connectorAccountId === context.matchId &&
        target.destinationAccountId === context.externalArtistId
      );
    },
  };
  const adapter = createBioSubmissionAdapter({
    providerId,
    load,
    send: message => new ResendEmailProvider().sendEmail(message),
  });
  return {
    destination,
    bio: current.bio,
    service: new ProfileWriteService(ledger, adapter),
  };
}

/** Initial requests only persist an exact preview; no execution is reachable here. */
export async function syncBioToDsps(
  request: BioSyncRequest
): Promise<BioSyncResponse> {
  const targets =
    request.providerIds ??
    (
      await db
        .select({ id: dspArtistMatches.providerId })
        .from(dspArtistMatches)
        .where(
          and(
            eq(dspArtistMatches.creatorProfileId, request.creatorProfileId),
            eq(dspArtistMatches.status, 'confirmed')
          )
        )
    ).map(match => match.id);
  const ids = [...new Set(targets)];
  const results: BioSyncResult[] = [];
  for (const providerId of ids) {
    if (getProfileDestination(providerId)?.method !== 'email') {
      results.push({ providerId, status: 'unsupported' });
      continue;
    }
    const {
      service,
      destination,
      bio: sourceBio,
    } = await createDspBioWriteService(
      request.userId,
      request.creatorProfileId,
      providerId
    );
    const bio = request.bioText ?? sourceBio;
    assertCustomerVoiceFloor(bio ?? '', 'dsp-bio-sync');
    const proposal = await service.propose({
      userId: request.userId,
      destination,
      desired: { bio },
    });
    results.push({
      providerId,
      status: 'pending',
      proposal,
      confirmation: confirmationFor(proposal),
    });
  }
  return {
    success: true,
    results,
    pendingCount: results.filter(result => result.status === 'pending').length,
  };
}

export async function approveBioSync(input: {
  userId: string;
  creatorProfileId: string;
  providerId: string;
  proposalId: string;
  confirmation: string;
}) {
  const { service } = await createDspBioWriteService(
    input.userId,
    input.creatorProfileId,
    input.providerId
  );
  // The immutable approval binds destination + field + exact value. A duplicate cannot dispatch.
  await service.approve(input.userId, input.proposalId, input.confirmation);
  return service.execute(input.userId, input.proposalId);
}

/** Legacy records remain readable, but never supply current execution status. */
export async function getBioSyncHistory(creatorProfileId: string) {
  return db
    .select()
    .from(dspBioSyncRequests)
    .where(eq(dspBioSyncRequests.creatorProfileId, creatorProfileId))
    .orderBy(desc(dspBioSyncRequests.createdAt));
}

export async function getBioSyncStatus(
  creatorProfileId: string,
  userId: string
) {
  const rows = await withDbSessionTx(
    async tx =>
      tx
        .select({ receipt: connectorWriteReceipts.receipt })
        .from(connectorWriteReceipts)
        .where(
          and(
            eq(connectorWriteReceipts.userId, userId),
            drizzleSql`${connectorWriteReceipts.receipt}->'proposal'->>'creatorProfileId' = ${creatorProfileId}`
          )
        )
        .orderBy(desc(connectorWriteReceipts.recordedAt)),
    { clerkUserId: userId }
  );
  const latest = new Map<string, (typeof rows)[number]['receipt']>();
  for (const { receipt } of rows)
    if (!latest.has(receipt.proposal.providerId))
      latest.set(receipt.proposal.providerId, receipt);
  return Array.from(latest, ([providerId, receipt]) => ({
    providerId,
    status: receipt.result,
    proposalId: receipt.proposal.id,
    receiptId: receipt.id,
    recordedAt: receipt.recordedAt,
    payloadSha256: digest(receipt.proposal.desired),
  }));
}

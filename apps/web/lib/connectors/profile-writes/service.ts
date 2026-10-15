import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  confirmationFor,
  digest,
  type ProfileDestination,
  type ProfileValues,
  type ProfileWriteAdapter,
  type ProfileWriteLedger,
  type ProfileWriteProposal,
  type ProfileWriteReceipt,
  providerWriteResultSchema,
  redactProviderReceipt,
  safeSnapshot,
  safeValues,
} from './contract';

/** Authenticated server callers supply the user identity, never a request-body actor. */
export class ProfileWriteService {
  constructor(
    private readonly ledger: ProfileWriteLedger,
    private readonly adapter: ProfileWriteAdapter,
    private readonly now: () => Date = () => new Date()
  ) {}

  private async authorize(userId: string, destination: ProfileDestination) {
    const manifest = this.adapter.manifest;
    if (
      destination.providerId !== manifest.providerId ||
      !(await this.ledger.authorize(
        userId,
        destination,
        manifest.requiredScopes
      ))
    )
      throw new Error('unauthorized-destination');
  }

  private checkManifest() {
    const manifest = this.adapter.manifest;
    if (manifest.rollback !== 'conditional-restore') {
      throw new Error(`rollback-${manifest.rollback}`);
    }
    if (
      !manifest.version ||
      !manifest.termsApproved ||
      !manifest.evidenceRef ||
      !(Date.parse(manifest.evidenceExpiresAt) > this.now().getTime()) ||
      !Number.isSafeInteger(manifest.rateLimitWindowSeconds) ||
      manifest.rateLimitWindowSeconds < 1
    )
      throw new Error('unverified-manifest');
  }

  private receipt(
    proposal: ProfileWriteProposal,
    phase: ProfileWriteReceipt['phase'],
    result: ProfileWriteReceipt['result'],
    extra: Partial<ProfileWriteReceipt> = {}
  ): ProfileWriteReceipt {
    const timestamp = this.now().toISOString();
    return {
      id: randomUUID(),
      phase,
      proposal,
      result,
      actorId: proposal.userId,
      approvalId: null,
      idempotencyKey: digest({
        proposalId: proposal.id,
        destination: proposal.connectorAccountId,
      }),
      requestMetadata: {
        fields: Object.keys(proposal.desired).sort(),
        payloadSha256: digest(proposal.desired),
      },
      before: proposal.before,
      after: null,
      providerReceipt: null,
      reason: null,
      startedAt: timestamp,
      recordedAt: timestamp,
      ...extra,
    };
  }

  async propose(input: {
    userId: string;
    destination: ProfileDestination;
    desired: ProfileValues;
  }): Promise<ProfileWriteProposal> {
    await this.authorize(input.userId, input.destination);
    this.checkManifest();
    const before = safeSnapshot(await this.adapter.read(input.destination));
    return this.saveProposal(
      input.userId,
      input.destination,
      before,
      input.desired,
      null
    );
  }

  private async saveProposal(
    userId: string,
    destination: ProfileDestination,
    before: ProfileWriteProposal['before'],
    values: ProfileValues,
    rollbackOf: string | null
  ) {
    const desired = safeValues(values);
    if (
      Object.keys(desired).some(
        field =>
          !this.adapter.manifest.fields.includes(field as keyof ProfileValues)
      )
    ) {
      throw new Error('unsupported-profile-field');
    }
    // Require the full managed state: rollback must never guess absent fields.
    if (
      digest(Object.keys(before.values).sort()) !==
      digest(Object.keys(desired).sort())
    ) {
      throw new Error('incomplete-destination-snapshot');
    }
    const proposal: ProfileWriteProposal = {
      ...destination,
      id: randomUUID(),
      userId,
      before,
      desired,
      rollbackOf,
      manifestVersion: this.adapter.manifest.version,
      manifestDigest: digest(this.adapter.manifest),
      evidenceRef: this.adapter.manifest.evidenceRef,
      expiresAt: new Date(this.now().getTime() + 15 * 60_000).toISOString(),
    };
    if (
      !(await this.ledger.append(
        this.receipt(proposal, 'proposal', 'proposed')
      ))
    ) {
      throw new Error('proposal-not-stored');
    }
    return proposal;
  }

  private async load(userId: string, proposalId: string) {
    const saved = await this.ledger.get(userId, proposalId, 'proposal');
    if (!saved || saved.proposal.userId !== userId)
      throw new Error('proposal-not-found');
    await this.authorize(userId, saved.proposal);
    return saved.proposal;
  }

  private checkProposal(proposal: ProfileWriteProposal) {
    this.checkManifest();
    if (
      proposal.manifestVersion !== this.adapter.manifest.version ||
      proposal.manifestDigest !== digest(this.adapter.manifest) ||
      proposal.evidenceRef !== this.adapter.manifest.evidenceRef ||
      !(Date.parse(proposal.expiresAt) > this.now().getTime())
    )
      throw new Error('stale-proposal');
  }

  async approve(userId: string, proposalId: string, confirmation: string) {
    const proposal = await this.load(userId, proposalId);
    this.checkProposal(proposal);
    if (confirmation !== confirmationFor(proposal))
      throw new Error('confirmation-mismatch');
    const receipt = this.receipt(proposal, 'approval', 'approved');
    const approval = { ...receipt, approvalId: receipt.id };
    if (!(await this.ledger.append(approval)))
      throw new Error('already-approved');
    return approval;
  }

  async execute(
    userId: string,
    proposalId: string
  ): Promise<ProfileWriteReceipt> {
    const proposal = await this.load(userId, proposalId);
    const existing = await this.ledger.get(userId, proposalId, 'outcome');
    if (existing) return existing;
    const approval = await this.ledger.get(userId, proposalId, 'approval');
    if (
      !approval ||
      confirmationFor(approval.proposal) !== confirmationFor(proposal)
    ) {
      throw new Error('approval-required');
    }
    if (await this.ledger.get(userId, proposalId, 'started')) {
      throw new Error('execution-in-progress-or-unknown');
    }
    const started = this.receipt(proposal, 'started', 'started', {
      approvalId: approval.id,
    });
    const blocked = async (reason: string) => {
      const outcome = this.receipt(proposal, 'outcome', 'blocked', {
        approvalId: approval.id,
        reason,
        startedAt: started.startedAt,
      });
      if (!(await this.ledger.append(outcome)))
        throw new Error('execution-conflict');
      return outcome;
    };
    let manifestValid = true;
    try {
      this.checkProposal(proposal);
    } catch {
      manifestValid = false;
    }
    const window = Math.floor(
      this.now().getTime() /
        (this.adapter.manifest.rateLimitWindowSeconds * 1000)
    );
    const rateKey = manifestValid
      ? digest({
          provider: proposal.providerId,
          account: proposal.destinationAccountId,
          window,
        })
      : undefined;
    if (!(await this.ledger.append(started, rateKey))) {
      // A concurrent execution may have won. Never append an outcome over its work.
      if (await this.ledger.get(userId, proposalId, 'started')) {
        throw new Error('execution-in-progress-or-unknown');
      }
      // Claim the proposal before recording a rate-limit denial, too.
      if (!(await this.ledger.append(started)))
        throw new Error('execution-conflict');
      return blocked('rate-limited');
    }
    if (!manifestValid) return blocked('preflight-failed');
    try {
      const current = safeSnapshot(await this.adapter.read(proposal));
      if (
        current.version !== proposal.before.version ||
        digest(current.values) !== digest(proposal.before.values)
      ) {
        return blocked('stale-destination');
      }
      await this.authorize(userId, proposal);
      this.checkProposal(proposal);
    } catch {
      return blocked('preflight-failed');
    }

    let providerReceipt: unknown = null;
    let writeResult: Awaited<ReturnType<ProfileWriteAdapter['write']>> | null =
      null;
    try {
      writeResult = providerWriteResultSchema.parse(
        await this.adapter.write({
          destination: proposal,
          expectedVersion: proposal.before.version,
          values: structuredClone(proposal.desired),
          idempotencyKey: started.idempotencyKey,
        })
      );
      providerReceipt = redactProviderReceipt(writeResult.receipt);
    } catch {
      // Transport failure gives no mutation identity, even if readback changed.
      writeResult = null;
    }
    let after: ProfileWriteReceipt['after'] = null;
    try {
      after = safeSnapshot(await this.adapter.read(proposal));
    } catch {
      // Unknown state is never retried or used as rollback authority.
    }
    const matches = after && digest(after.values) === digest(proposal.desired);
    const attributed = after && writeResult?.version === after.version;
    const result =
      writeResult?.status === 'rejected'
        ? 'failed'
        : !attributed
          ? 'unknown'
          : writeResult?.status === 'applied' && matches
            ? 'succeeded'
            : 'partial';
    const outcome = this.receipt(proposal, 'outcome', result, {
      approvalId: approval.id,
      after,
      providerReceipt,
      startedAt: started.startedAt,
      reason: !writeResult
        ? 'provider-result-unknown'
        : after
          ? null
          : 'readback-failed',
    });
    // Failure here deliberately throws. The durable start still prevents re-dispatch.
    if (!(await this.ledger.append(outcome)))
      throw new Error('outcome-not-stored');
    return outcome;
  }

  async proposeRollback(userId: string, proposalId: string) {
    const original = await this.load(userId, proposalId);
    this.checkManifest();
    const outcome = await this.ledger.get(userId, proposalId, 'outcome');
    if (
      !outcome?.after ||
      !['succeeded', 'partial'].includes(outcome.result) ||
      original.manifestDigest !== digest(this.adapter.manifest)
    )
      throw new Error('rollback-unprovable');
    const current = safeSnapshot(await this.adapter.read(original));
    if (
      current.version !== outcome.after.version ||
      digest(current.values) !== digest(outcome.after.values)
    ) {
      throw new Error('stale-destination');
    }
    return this.saveProposal(
      userId,
      original,
      current,
      original.before.values,
      outcome.id
    );
  }
}

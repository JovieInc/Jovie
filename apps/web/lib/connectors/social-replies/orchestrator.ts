import {
  createReplyBatchFingerprint,
  normalizeReplyText,
  type SocialReplyAdapter,
  type SocialReplyAdapterRegistry,
  type SocialReplyBatchCounts,
  type SocialReplyBatchOptions,
  type SocialReplyBatchReceipt,
  type SocialReplyBatchRequest,
  type SocialReplyFailureReason,
  type SocialReplyItemReceipt,
  type SocialReplyPreflight,
  type SocialReplyTarget,
  socialReplyBatchReceiptSchema,
  socialReplyBatchRequestSchema,
  socialReplyPreflightSchema,
  socialReplyVerificationResultSchema,
  socialReplyWriteResultSchema,
} from './contract';

const DEFAULT_MIN_DELAY_MS = 2_500;
const EMPTY_METADATA: Record<string, unknown> = {};

type MutableItemReceipt = SocialReplyItemReceipt;

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

function asIsoTimestamp(now: () => Date): string {
  return now().toISOString();
}

function failureMessage(reason: SocialReplyFailureReason): string {
  switch (reason) {
    case 'batch-halted':
      return 'Not attempted because an earlier item halted the batch.';
    case 'missing-adapter':
      return 'No provider adapter was configured for this platform.';
    case 'adapter-platform-mismatch':
      return 'The configured adapter identity does not match the target platform.';
    case 'preflight-error':
      return 'Preflight failed before reply safety could be established.';
    case 'invalid-preflight-result':
      return 'Preflight returned an invalid safety result.';
    case 'write-error-ambiguous':
      return 'The provider write errored after dispatch may have started; retry is forbidden.';
    case 'write-ambiguous':
      return 'The provider reported an ambiguous write; retry is forbidden.';
    case 'invalid-write-result':
      return 'The provider returned an invalid write receipt; retry is forbidden.';
    case 'verification-error-ambiguous':
      return 'Post-write verification errored; the final provider state is unknown.';
    case 'verification-not-found':
      return 'The provider did not expose the newly written reply during verification.';
    case 'verification-mismatch':
      return 'Verification did not match the exact provider reply ID and text.';
    case 'verification-ambiguous':
      return 'The provider reported an ambiguous verification state.';
    case 'invalid-verification-result':
      return 'The provider returned an invalid verification receipt.';
    case 'approval-mismatch':
      return 'Approval did not bind to this exact batch copy and destination set.';
  }
}

function baseItemReceipt(
  target: SocialReplyTarget,
  draftedAt: string
): MutableItemReceipt {
  return {
    targetId: target.targetId,
    sourceId: target.sourceId,
    platform: target.platform,
    sourceUrl: target.sourceUrl,
    draftedText: target.draftedText,
    normalizedText: normalizeReplyText(target.draftedText),
    status: 'draft',
    draftedAt,
    preflight: null,
    providerReplyId: null,
    postedAt: null,
    verifiedAt: null,
    skipReason: null,
    failureReason: null,
    failureMessage: null,
    baselineMetadata: { ...target.baselineMetadata },
    providerMetadata: { ...EMPTY_METADATA },
  };
}

function withFailure(
  item: MutableItemReceipt,
  reason: SocialReplyFailureReason,
  status: 'failed' | 'ambiguous',
  message = failureMessage(reason)
): MutableItemReceipt {
  item.status = status;
  item.failureReason = reason;
  item.failureMessage = message;
  return item;
}

function withSkipped(
  item: MutableItemReceipt,
  reason: 'not-public' | 'not-replyable' | 'already-replied'
): MutableItemReceipt {
  item.status = 'skipped';
  item.skipReason = reason;
  return item;
}

function countsForItems(
  items: ReadonlyArray<SocialReplyItemReceipt>
): SocialReplyBatchCounts {
  return items.reduce<SocialReplyBatchCounts>(
    (counts, item) => {
      switch (item.status) {
        case 'draft':
          counts.drafted += 1;
          break;
        case 'posted':
          counts.posted += 1;
          break;
        case 'skipped':
          counts.skipped += 1;
          break;
        case 'failed':
          counts.failed += 1;
          break;
        case 'ambiguous':
          counts.ambiguous += 1;
          break;
      }
      return counts;
    },
    { drafted: 0, posted: 0, skipped: 0, failed: 0, ambiguous: 0 }
  );
}

function buildReceipt(
  request: SocialReplyBatchRequest,
  items: ReadonlyArray<SocialReplyItemReceipt>,
  startedAt: string,
  completedAt: string,
  haltReason: SocialReplyBatchReceipt['haltReason']
): SocialReplyBatchReceipt {
  return socialReplyBatchReceiptSchema.parse({
    schemaVersion: 'social-reply-batch/v1',
    batchId: request.batchId,
    mode: request.mode,
    startedAt,
    completedAt,
    halted: haltReason !== null,
    haltReason,
    counts: countsForItems(items),
    items,
  });
}

function appendUnattemptedItems(
  targets: ReadonlyArray<SocialReplyTarget>,
  fromIndex: number,
  items: MutableItemReceipt[],
  draftedAt: string
): void {
  for (const target of targets.slice(fromIndex)) {
    const item = baseItemReceipt(target, draftedAt);
    withFailure(item, 'batch-halted', 'failed');
    items.push(item);
  }
}

function sortedTargetIds(targets: ReadonlyArray<SocialReplyTarget>): string[] {
  return targets
    .map(target => target.targetId)
    .sort((left, right) => left.localeCompare(right));
}

function hasSameTargetIds(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>
): boolean {
  if (left.length !== right.length) return false;
  return left.every((targetId, index) => targetId === right[index]);
}

function approvalIsBound(
  request: SocialReplyBatchRequest,
  fingerprint: string
): boolean {
  const approval = request.approval;
  if (!approval) return false;
  return (
    approval.draftFingerprint === fingerprint &&
    hasSameTargetIds(
      [...approval.targetIds].sort((left, right) => left.localeCompare(right)),
      sortedTargetIds(request.targets)
    )
  );
}

function mergeProviderMetadata(
  left: Record<string, unknown>,
  right: Record<string, unknown>
): Record<string, unknown> {
  return { ...left, ...right };
}

function preflightBaselineMetadata(
  target: SocialReplyTarget,
  preflight: SocialReplyPreflight
): Record<string, unknown> {
  return {
    ...target.baselineMetadata,
    preflight: preflight.baselineMetadata,
  };
}

/**
 * Runs a social reply batch without knowing anything about provider APIs.
 *
 * Draft mode is the default and performs no adapter calls. Approved mode
 * requires a fingerprint binding the exact copy and destination set. Once a
 * provider write is attempted, every non-verified state halts the remaining
 * batch; this deliberately avoids blind retries for eventually-consistent or
 * partially-committed APIs.
 */
export async function runSocialReplyBatch(
  input: unknown,
  adapters: SocialReplyAdapterRegistry = {},
  options: SocialReplyBatchOptions = {}
): Promise<SocialReplyBatchReceipt> {
  const request = socialReplyBatchRequestSchema.parse(input);
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? defaultSleep;
  const minDelayMs = options.minDelayMs ?? DEFAULT_MIN_DELAY_MS;

  if (!Number.isFinite(minDelayMs) || minDelayMs < 0) {
    throw new RangeError('minDelayMs must be a finite non-negative number');
  }

  const startedAt = asIsoTimestamp(now);
  const draftedAt = startedAt;

  if (request.mode === 'draft') {
    const items = request.targets.map(target =>
      baseItemReceipt(target, draftedAt)
    );
    return buildReceipt(request, items, startedAt, asIsoTimestamp(now), null);
  }

  const fingerprint = createReplyBatchFingerprint(request.targets);
  if (!approvalIsBound(request, fingerprint)) {
    const items = request.targets.map(target => {
      const item = baseItemReceipt(target, draftedAt);
      return withFailure(item, 'approval-mismatch', 'failed');
    });
    return buildReceipt(
      request,
      items,
      startedAt,
      asIsoTimestamp(now),
      'approval-mismatch'
    );
  }

  const items: MutableItemReceipt[] = [];
  let haltReason: SocialReplyBatchReceipt['haltReason'] = null;
  let writesAttempted = 0;

  for (const [index, target] of request.targets.entries()) {
    const item = baseItemReceipt(target, draftedAt);
    const adapter: SocialReplyAdapter | undefined = adapters[target.platform];

    if (!adapter) {
      withFailure(item, 'missing-adapter', 'failed');
      items.push(item);
      haltReason = 'missing-adapter';
      appendUnattemptedItems(request.targets, index + 1, items, draftedAt);
      break;
    }

    if (adapter.platform !== target.platform) {
      withFailure(item, 'adapter-platform-mismatch', 'failed');
      items.push(item);
      haltReason = 'adapter-platform-mismatch';
      appendUnattemptedItems(request.targets, index + 1, items, draftedAt);
      break;
    }

    if (writesAttempted > 0 && minDelayMs > 0) {
      await sleep(minDelayMs);
    }

    let preflightRaw: unknown;
    try {
      preflightRaw = await adapter.preflight(target);
    } catch {
      withFailure(item, 'preflight-error', 'ambiguous');
      items.push(item);
      haltReason = 'preflight-error';
      appendUnattemptedItems(request.targets, index + 1, items, draftedAt);
      break;
    }

    const preflightResult = socialReplyPreflightSchema.safeParse(preflightRaw);
    if (!preflightResult.success) {
      withFailure(item, 'invalid-preflight-result', 'ambiguous');
      items.push(item);
      haltReason = 'invalid-preflight-result';
      appendUnattemptedItems(request.targets, index + 1, items, draftedAt);
      break;
    }

    const preflight = preflightResult.data;
    item.preflight = preflight;
    item.baselineMetadata = preflightBaselineMetadata(target, preflight);

    if (!preflight.isPublic) {
      withSkipped(item, 'not-public');
      items.push(item);
      continue;
    }

    if (!preflight.canReply) {
      withSkipped(item, 'not-replyable');
      items.push(item);
      continue;
    }

    if (preflight.alreadyReplied || preflight.existingReplyCount > 0) {
      withSkipped(item, 'already-replied');
      items.push(item);
      continue;
    }

    writesAttempted += 1;

    let writeRaw: unknown;
    try {
      writeRaw = await adapter.writeReply(target);
    } catch {
      withFailure(item, 'write-error-ambiguous', 'ambiguous');
      items.push(item);
      haltReason = 'write-error-ambiguous';
      appendUnattemptedItems(request.targets, index + 1, items, draftedAt);
      break;
    }

    const writeResult = socialReplyWriteResultSchema.safeParse(writeRaw);
    if (!writeResult.success) {
      withFailure(item, 'invalid-write-result', 'ambiguous');
      items.push(item);
      haltReason = 'invalid-write-result';
      appendUnattemptedItems(request.targets, index + 1, items, draftedAt);
      break;
    }

    if (writeResult.data.status === 'ambiguous') {
      item.providerMetadata = { ...writeResult.data.providerMetadata };
      withFailure(
        item,
        'write-ambiguous',
        'ambiguous',
        writeResult.data.reason
      );
      items.push(item);
      haltReason = 'write-ambiguous';
      appendUnattemptedItems(request.targets, index + 1, items, draftedAt);
      break;
    }

    item.providerReplyId = writeResult.data.providerReplyId;
    item.postedAt = asIsoTimestamp(now);
    item.providerMetadata = { ...writeResult.data.providerMetadata };

    let verificationRaw: unknown;
    try {
      verificationRaw = await adapter.verifyReply(target, writeResult.data);
    } catch {
      withFailure(item, 'verification-error-ambiguous', 'ambiguous');
      items.push(item);
      haltReason = 'verification-error-ambiguous';
      appendUnattemptedItems(request.targets, index + 1, items, draftedAt);
      break;
    }

    const verificationResult =
      socialReplyVerificationResultSchema.safeParse(verificationRaw);
    if (!verificationResult.success) {
      withFailure(item, 'invalid-verification-result', 'ambiguous');
      items.push(item);
      haltReason = 'invalid-verification-result';
      appendUnattemptedItems(request.targets, index + 1, items, draftedAt);
      break;
    }

    const verification = verificationResult.data;
    item.providerMetadata = mergeProviderMetadata(
      item.providerMetadata,
      verification.providerMetadata
    );

    if (verification.status !== 'verified') {
      const reason: SocialReplyFailureReason =
        verification.status === 'not-found'
          ? 'verification-not-found'
          : verification.status === 'mismatch'
            ? 'verification-mismatch'
            : 'verification-ambiguous';
      withFailure(item, reason, 'ambiguous', verification.reason);
      items.push(item);
      haltReason = reason;
      appendUnattemptedItems(request.targets, index + 1, items, draftedAt);
      break;
    }

    if (
      verification.providerReplyId !== writeResult.data.providerReplyId ||
      verification.verifiedText !== target.draftedText
    ) {
      withFailure(item, 'verification-mismatch', 'ambiguous');
      items.push(item);
      haltReason = 'verification-mismatch';
      appendUnattemptedItems(request.targets, index + 1, items, draftedAt);
      break;
    }

    item.status = 'posted';
    item.verifiedAt = verification.verifiedAt;
    items.push(item);
  }

  return buildReceipt(
    request,
    items,
    startedAt,
    asIsoTimestamp(now),
    haltReason
  );
}

export { createReplyBatchFingerprint, normalizeReplyText } from './contract';

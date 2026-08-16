import {
  ComposioCommandError,
  ComposioToolError,
  type ComposioToolExecutor,
  isRecord,
} from './composio-command';

export const YOUTUBE_TOOLS = {
  verifyAccount: 'YOUTUBE_GET_CHANNEL_STATISTICS',
  listCommentThreads: 'YOUTUBE_LIST_COMMENT_THREADS2',
  createCommentReply: 'YOUTUBE_CREATE_COMMENT_REPLY',
} as const;

export const DEFAULT_MIN_DELAY_MS = 2_000;
export const YOUTUBE_PLATFORM = 'youtube' as const;

export type YouTubeReplyMode = 'dry-run' | 'execute';

/** Canonical action shape shared with the social-replies engine. */
export interface YouTubeReplyAction {
  readonly platform: typeof YOUTUBE_PLATFORM;
  readonly actionId: string;
  readonly accountId: string;
  /** YouTube comment id that receives the reply. */
  readonly sourceItemId: string;
  readonly body: string;
  readonly approvalId?: string;
}

export interface YouTubeReplyBatch {
  readonly platform: typeof YOUTUBE_PLATFORM;
  /** Expected authenticated channel id, never inferred from a write. */
  readonly accountId: string;
  readonly approvalId?: string;
  readonly actions: readonly YouTubeReplyAction[];
}

export interface YouTubePreflightReceipt {
  readonly status: 'ready' | 'blocked';
  readonly reason?:
    | 'comment_not_found'
    | 'comment_not_public'
    | 'reply_not_allowed'
    | 'already_replied'
    | 'reply_count_unknown';
  readonly accountId: string;
  readonly sourceItemId: string;
  readonly currentReplyCount: number | null;
  readonly checkedAt: string;
}

export interface YouTubeWriteReceipt {
  readonly status: 'written';
  readonly sourceItemId: string;
  readonly remoteId: string | null;
  readonly body: string;
  readonly writtenAt: string;
}

export interface YouTubeVerifyReceipt {
  readonly status: 'verified' | 'unverified';
  readonly sourceItemId: string;
  readonly remoteId: string | null;
  readonly reason?: 'reply_not_visible' | 'reply_text_mismatch';
  readonly verifiedAt: string;
}

export interface YouTubeReplyAdapter {
  readonly preflight: (input: {
    readonly action: YouTubeReplyAction;
  }) => Promise<YouTubePreflightReceipt>;
  readonly write: (input: {
    readonly action: YouTubeReplyAction;
    readonly approvalId: string;
  }) => Promise<YouTubeWriteReceipt>;
  readonly verify: (input: {
    readonly action: YouTubeReplyAction;
    readonly write: YouTubeWriteReceipt;
  }) => Promise<YouTubeVerifyReceipt>;
}

export interface YouTubeAdapterOptions {
  readonly execute: ComposioToolExecutor;
  readonly minDelayMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => Date;
}

export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputValidationError';
  }
}

export class YouTubeAccountMismatchError extends Error {
  readonly expectedChannelId: string;
  readonly actualChannelIds: readonly string[];

  constructor(expectedChannelId: string, actualChannelIds: readonly string[]) {
    super(
      `Authenticated YouTube channel did not match expected channel ${expectedChannelId}`
    );
    this.name = 'YouTubeAccountMismatchError';
    this.expectedChannelId = expectedChannelId;
    this.actualChannelIds = actualChannelIds;
  }
}

export class ApprovalMismatchError extends Error {
  constructor() {
    super('Execution approval does not match the approved action');
    this.name = 'ApprovalMismatchError';
  }
}

export class PreflightBlockedError extends Error {
  readonly receipt: YouTubePreflightReceipt;

  constructor(receipt: YouTubePreflightReceipt) {
    super(`YouTube reply preflight blocked: ${receipt.reason ?? 'unknown'}`);
    this.name = 'PreflightBlockedError';
    this.receipt = receipt;
  }
}

export class AmbiguousWriteError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      'YouTube reply write outcome is ambiguous; inspect the thread before retrying'
    );
    this.name = 'AmbiguousWriteError';
    this.cause = cause;
  }
}

export interface YouTubeBatchItemReceipt {
  readonly actionId: string;
  readonly sourceItemId: string;
  readonly status:
    | 'dry_run_ready'
    | 'dry_run_blocked'
    | 'verified'
    | 'blocked'
    | 'ambiguous'
    | 'failed'
    | 'skipped_after_halt';
  readonly preflight?: YouTubePreflightReceipt;
  readonly write?: YouTubeWriteReceipt;
  readonly verify?: YouTubeVerifyReceipt;
  readonly errorCode?: string;
}

export interface YouTubeBatchReceipt {
  readonly platform: typeof YOUTUBE_PLATFORM;
  readonly mode: YouTubeReplyMode;
  readonly accountId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly halted: boolean;
  readonly haltReason?: string;
  readonly items: readonly YouTubeBatchItemReceipt[];
}

type Sleep = (milliseconds: number) => Promise<void>;
type Clock = () => Date;

interface ThreadSnapshot {
  readonly id: string;
  readonly canReply: boolean | undefined;
  readonly isPublic: boolean | undefined;
  readonly totalReplyCount: number | undefined;
  readonly replies: readonly Record<string, unknown>[];
}

interface RawReplyAction {
  readonly actionId?: unknown;
  readonly id?: unknown;
  readonly accountId?: unknown;
  readonly sourceItemId?: unknown;
  readonly parentId?: unknown;
  readonly body?: unknown;
  readonly text?: unknown;
  readonly textOriginal?: unknown;
  readonly approvalId?: unknown;
}

/**
 * Create the platform adapter consumed by Ovie/Jovie's social-replies engine.
 *
 * Every write performs a fresh account and parent-thread preflight. That is
 * intentionally stricter than trusting a queue-time snapshot: stale drafts,
 * duplicate replies, and wrong connected accounts fail closed.
 */
export function createYouTubeComposioAdapter(
  options: YouTubeAdapterOptions
): YouTubeReplyAdapter {
  const sleep: Sleep = options.sleep ?? defaultSleep;
  const now: Clock = options.now ?? (() => new Date());
  const minDelayMs = Math.max(0, options.minDelayMs ?? DEFAULT_MIN_DELAY_MS);
  let lastCallAt = 0;

  const execute = async (
    slug: string,
    input: Readonly<Record<string, unknown>>
  ): Promise<unknown> => {
    const elapsed = Date.now() - lastCallAt;
    const remaining = minDelayMs - elapsed;
    if (lastCallAt > 0 && remaining > 0) await sleep(remaining);
    try {
      return await options.execute(slug, input);
    } finally {
      lastCallAt = Date.now();
    }
  };

  const verifyAccount = async (expectedChannelId: string): Promise<void> => {
    const response = await execute(YOUTUBE_TOOLS.verifyAccount, {
      mine: true,
      part: 'snippet,statistics',
    });
    const actualChannelIds = extractItems(response)
      .map(item => getString(item.id))
      .filter((id): id is string => id !== undefined);

    if (
      actualChannelIds.length !== 1 ||
      actualChannelIds[0] !== expectedChannelId
    ) {
      throw new YouTubeAccountMismatchError(
        expectedChannelId,
        actualChannelIds
      );
    }
  };

  const readThread = async (
    sourceItemId: string
  ): Promise<ThreadSnapshot | null> => {
    const response = await execute(YOUTUBE_TOOLS.listCommentThreads, {
      id: sourceItemId,
      part: 'snippet,replies',
      textFormat: 'plainText',
    });
    const item = extractItems(response).find(
      candidate => getString(candidate.id) === sourceItemId
    );
    return item ? toThreadSnapshot(item, sourceItemId) : null;
  };

  const preflight = async ({
    action,
  }: {
    readonly action: YouTubeReplyAction;
  }): Promise<YouTubePreflightReceipt> => {
    validateAction(action);
    await verifyAccount(action.accountId);
    const thread = await readThread(action.sourceItemId);
    const checkedAt = now().toISOString();

    if (!thread) {
      return {
        status: 'blocked',
        reason: 'comment_not_found',
        accountId: action.accountId,
        sourceItemId: action.sourceItemId,
        currentReplyCount: null,
        checkedAt,
      };
    }

    if (thread.isPublic !== true) {
      return {
        status: 'blocked',
        reason: 'comment_not_public',
        accountId: action.accountId,
        sourceItemId: action.sourceItemId,
        currentReplyCount: thread.totalReplyCount ?? null,
        checkedAt,
      };
    }

    if (thread.canReply !== true) {
      return {
        status: 'blocked',
        reason: 'reply_not_allowed',
        accountId: action.accountId,
        sourceItemId: action.sourceItemId,
        currentReplyCount: thread.totalReplyCount ?? null,
        checkedAt,
      };
    }

    if (thread.totalReplyCount === undefined) {
      return {
        status: 'blocked',
        reason: 'reply_count_unknown',
        accountId: action.accountId,
        sourceItemId: action.sourceItemId,
        currentReplyCount: null,
        checkedAt,
      };
    }

    if (thread.totalReplyCount > 0) {
      return {
        status: 'blocked',
        reason: 'already_replied',
        accountId: action.accountId,
        sourceItemId: action.sourceItemId,
        currentReplyCount: thread.totalReplyCount,
        checkedAt,
      };
    }

    return {
      status: 'ready',
      accountId: action.accountId,
      sourceItemId: action.sourceItemId,
      currentReplyCount: 0,
      checkedAt,
    };
  };

  const write = async ({
    action,
    approvalId,
  }: {
    readonly action: YouTubeReplyAction;
    readonly approvalId: string;
  }): Promise<YouTubeWriteReceipt> => {
    validateAction(action);
    if (!action.approvalId || action.approvalId !== approvalId) {
      throw new ApprovalMismatchError();
    }

    // Revalidate immediately before mutating the provider.
    const currentPreflight = await preflight({ action });
    if (currentPreflight.status !== 'ready') {
      throw new PreflightBlockedError(currentPreflight);
    }

    let response: unknown;
    try {
      response = await execute(YOUTUBE_TOOLS.createCommentReply, {
        parentId: action.sourceItemId,
        textOriginal: action.body,
      });
    } catch (error: unknown) {
      // Even a parser or transport error can follow an accepted provider
      // mutation. Never classify a failed create as safely retryable.
      throw new AmbiguousWriteError(error);
    }

    return {
      status: 'written',
      sourceItemId: action.sourceItemId,
      remoteId: extractCreatedCommentId(response),
      body: action.body,
      writtenAt: now().toISOString(),
    };
  };

  const verify = async ({
    action,
    write: writeReceipt,
  }: {
    readonly action: YouTubeReplyAction;
    readonly write: YouTubeWriteReceipt;
  }): Promise<YouTubeVerifyReceipt> => {
    validateAction(action);
    await verifyAccount(action.accountId);
    const thread = await readThread(action.sourceItemId);
    const verifiedAt = now().toISOString();
    if (!thread) {
      return {
        status: 'unverified',
        sourceItemId: action.sourceItemId,
        remoteId: writeReceipt.remoteId,
        reason: 'reply_not_visible',
        verifiedAt,
      };
    }

    const matchingReply = thread.replies.find(reply => {
      const snippet = isRecord(reply.snippet) ? reply.snippet : undefined;
      const text = getString(snippet?.textOriginal);
      if (text !== action.body) return false;

      const authorChannelId = getAuthorChannelId(reply);
      if (
        authorChannelId !== undefined &&
        authorChannelId !== action.accountId
      ) {
        return false;
      }

      if (!writeReceipt.remoteId) return true;
      return getString(reply.id) === writeReceipt.remoteId;
    });

    if (matchingReply) {
      return {
        status: 'verified',
        sourceItemId: action.sourceItemId,
        remoteId: writeReceipt.remoteId ?? getString(matchingReply.id) ?? null,
        verifiedAt,
      };
    }

    return {
      status: 'unverified',
      sourceItemId: action.sourceItemId,
      remoteId: writeReceipt.remoteId,
      reason:
        thread.replies.length > 0 ? 'reply_text_mismatch' : 'reply_not_visible',
      verifiedAt,
    };
  };

  return { preflight, write, verify };
}

export interface RunYouTubeBatchOptions {
  readonly mode: YouTubeReplyMode;
  /** Required for execute mode; bound to every approved action. */
  readonly approvalId?: string;
}

/**
 * Run a batch serially. A write failure or unverifiable write halts the
 * remainder so an operator never receives a receipt that implies safe retries.
 */
export async function runYouTubeReplyBatch(
  batch: YouTubeReplyBatch,
  adapter: YouTubeReplyAdapter,
  options: RunYouTubeBatchOptions,
  now: Clock = () => new Date()
): Promise<YouTubeBatchReceipt> {
  validateBatch(batch);
  if (options.mode === 'execute' && !options.approvalId) {
    throw new ApprovalMismatchError();
  }
  if (
    options.approvalId &&
    batch.approvalId &&
    options.approvalId !== batch.approvalId
  ) {
    throw new ApprovalMismatchError();
  }

  const startedAt = now().toISOString();
  const receipts: YouTubeBatchItemReceipt[] = [];
  let halted = false;
  let haltReason: string | undefined;

  for (const action of batch.actions) {
    if (halted) {
      receipts.push({
        actionId: action.actionId,
        sourceItemId: action.sourceItemId,
        status: 'skipped_after_halt',
      });
      continue;
    }

    if (
      options.mode === 'execute' &&
      action.approvalId !== options.approvalId
    ) {
      receipts.push({
        actionId: action.actionId,
        sourceItemId: action.sourceItemId,
        status: 'blocked',
        errorCode: 'approval_mismatch',
      });
      continue;
    }

    let preflight: YouTubePreflightReceipt;
    try {
      preflight = await adapter.preflight({ action });
    } catch (error: unknown) {
      receipts.push({
        actionId: action.actionId,
        sourceItemId: action.sourceItemId,
        status: 'blocked',
        errorCode: errorCode(error),
      });
      if (error instanceof YouTubeAccountMismatchError) {
        halted = true;
        haltReason = 'authenticated_account_mismatch';
      }
      continue;
    }

    if (preflight.status !== 'ready') {
      receipts.push({
        actionId: action.actionId,
        sourceItemId: action.sourceItemId,
        status: options.mode === 'dry-run' ? 'dry_run_blocked' : 'blocked',
        preflight,
      });
      continue;
    }

    if (options.mode === 'dry-run') {
      receipts.push({
        actionId: action.actionId,
        sourceItemId: action.sourceItemId,
        status: 'dry_run_ready',
        preflight,
      });
      continue;
    }

    let writeReceipt: YouTubeWriteReceipt;
    try {
      writeReceipt = await adapter.write({
        action,
        approvalId: options.approvalId as string,
      });
    } catch (error: unknown) {
      receipts.push({
        actionId: action.actionId,
        sourceItemId: action.sourceItemId,
        status: error instanceof AmbiguousWriteError ? 'ambiguous' : 'failed',
        preflight,
        errorCode: errorCode(error),
      });
      halted = true;
      haltReason =
        error instanceof AmbiguousWriteError
          ? 'ambiguous_write_inspect_before_retry'
          : errorCode(error);
      continue;
    }

    let verifyReceipt: YouTubeVerifyReceipt;
    try {
      verifyReceipt = await adapter.verify({
        action,
        write: writeReceipt,
      });
    } catch (error: unknown) {
      receipts.push({
        actionId: action.actionId,
        sourceItemId: action.sourceItemId,
        status: 'ambiguous',
        preflight,
        write: writeReceipt,
        errorCode: errorCode(error),
      });
      halted = true;
      haltReason = 'verification_failed_inspect_before_retry';
      continue;
    }

    if (verifyReceipt.status !== 'verified') {
      receipts.push({
        actionId: action.actionId,
        sourceItemId: action.sourceItemId,
        status: 'ambiguous',
        preflight,
        write: writeReceipt,
        verify: verifyReceipt,
        errorCode: verifyReceipt.reason ?? 'reply_not_verified',
      });
      halted = true;
      haltReason = 'reply_not_verified_inspect_before_retry';
      continue;
    }

    receipts.push({
      actionId: action.actionId,
      sourceItemId: action.sourceItemId,
      status: 'verified',
      preflight,
      write: writeReceipt,
      verify: verifyReceipt,
    });
  }

  return {
    platform: YOUTUBE_PLATFORM,
    mode: options.mode,
    accountId: batch.accountId,
    startedAt,
    finishedAt: now().toISOString(),
    halted,
    ...(haltReason ? { haltReason } : {}),
    items: receipts,
  };
}

/** Normalize a JSON batch into the engine's canonical action shape. */
export function parseYouTubeReplyBatch(
  value: unknown,
  options?: { readonly expectedChannelId?: string }
): YouTubeReplyBatch {
  const input = isRecord(value) ? value : undefined;
  if (!input) throw new InputValidationError('Batch must be a JSON object');

  const platform = input.platform;
  if (platform !== undefined && platform !== YOUTUBE_PLATFORM) {
    throw new InputValidationError('Batch platform must be youtube');
  }

  const accountId = getString(input.accountId ?? input.expectedChannelId);
  if (!accountId) {
    throw new InputValidationError(
      'Batch must include the expected YouTube channel id as accountId'
    );
  }
  if (options?.expectedChannelId && options.expectedChannelId !== accountId) {
    throw new InputValidationError(
      'CLI expected channel id does not match the batch account id'
    );
  }

  const approvalId = getString(input.approvalId);
  const rawActions = input.actions ?? input.items;
  if (!Array.isArray(rawActions) || rawActions.length === 0) {
    throw new InputValidationError(
      'Batch must include a non-empty actions array'
    );
  }

  const actions = rawActions.map((rawAction, index) => {
    if (!isRecord(rawAction)) {
      throw new InputValidationError(`Action ${index + 1} must be an object`);
    }
    const candidate = rawAction as RawReplyAction;
    const sourceItemId = getString(
      candidate.sourceItemId ?? candidate.parentId
    );
    const body = getString(
      candidate.body ?? candidate.text ?? candidate.textOriginal
    );
    if (!sourceItemId || !body) {
      throw new InputValidationError(
        `Action ${index + 1} must include sourceItemId and body`
      );
    }
    if (body.length > 10_000) {
      throw new InputValidationError(`Action ${index + 1} body is too long`);
    }

    const actionAccountId = getString(candidate.accountId) ?? accountId;
    if (actionAccountId !== accountId) {
      throw new InputValidationError(
        `Action ${index + 1} account id does not match the batch`
      );
    }

    return {
      platform: YOUTUBE_PLATFORM,
      actionId: getString(candidate.actionId ?? candidate.id) ?? sourceItemId,
      accountId,
      sourceItemId,
      body,
      ...((getString(candidate.approvalId) ?? approvalId)
        ? {
            approvalId: getString(candidate.approvalId) ?? approvalId,
          }
        : {}),
    } satisfies YouTubeReplyAction;
  });

  const actionIds = new Set<string>();
  const sourceItemIds = new Set<string>();
  const replyBodies = new Set<string>();
  for (const action of actions) {
    if (actionIds.has(action.actionId)) {
      throw new InputValidationError(`Duplicate action id: ${action.actionId}`);
    }
    if (sourceItemIds.has(action.sourceItemId)) {
      throw new InputValidationError(
        `Duplicate source comment id: ${action.sourceItemId}`
      );
    }
    const normalizedBody = action.body
      .normalize('NFKC')
      .trim()
      .replace(/\s+/gu, ' ')
      .toLocaleLowerCase('en-US');
    if (replyBodies.has(normalizedBody)) {
      throw new InputValidationError(
        `Duplicate reply body after normalization: ${action.actionId}`
      );
    }
    actionIds.add(action.actionId);
    sourceItemIds.add(action.sourceItemId);
    replyBodies.add(normalizedBody);
  }

  return {
    platform: YOUTUBE_PLATFORM,
    accountId,
    ...(approvalId ? { approvalId } : {}),
    actions,
  };
}

function validateBatch(batch: YouTubeReplyBatch): void {
  if (batch.platform !== YOUTUBE_PLATFORM) {
    throw new InputValidationError('Batch platform must be youtube');
  }
  if (!batch.accountId) {
    throw new InputValidationError('Batch account id is required');
  }
  if (batch.actions.length === 0) {
    throw new InputValidationError('Batch actions cannot be empty');
  }
  for (const action of batch.actions) validateAction(action);
}

function validateAction(action: YouTubeReplyAction): void {
  if (action.platform !== YOUTUBE_PLATFORM) {
    throw new InputValidationError('Reply action platform must be youtube');
  }
  if (!action.actionId || !action.accountId || !action.sourceItemId) {
    throw new InputValidationError('Reply action identity fields are required');
  }
  if (action.body.trim().length === 0) {
    throw new InputValidationError('Reply body cannot be empty');
  }
}

function toThreadSnapshot(
  item: Record<string, unknown>,
  fallbackId: string
): ThreadSnapshot {
  const snippet = isRecord(item.snippet) ? item.snippet : undefined;
  const replies = isRecord(item.replies) ? item.replies : undefined;
  const rawComments = replies?.comments;
  return {
    id: getString(item.id) ?? fallbackId,
    canReply: getBoolean(snippet?.canReply),
    isPublic: getBoolean(snippet?.isPublic),
    totalReplyCount: getNumber(snippet?.totalReplyCount),
    replies: Array.isArray(rawComments) ? rawComments.filter(isRecord) : [],
  };
}

function extractItems(response: unknown): readonly Record<string, unknown>[] {
  const candidates: unknown[] = [response];
  if (isRecord(response)) {
    candidates.push(response.data, response.response_data);
    if (isRecord(response.data)) {
      candidates.push(response.data.data, response.data.response_data);
    }
  }

  for (const candidate of candidates) {
    if (!isRecord(candidate) || !Array.isArray(candidate.items)) continue;
    return candidate.items.filter(isRecord);
  }
  return [];
}

function extractCreatedCommentId(response: unknown): string | null {
  const candidates: unknown[] = [response];
  if (isRecord(response)) {
    candidates.push(response.data, response.response_data);
    if (isRecord(response.data)) {
      candidates.push(response.data.data, response.data.comment);
    }
  }
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const id = getString(candidate.id);
    if (id) return id;
  }
  return null;
}

function getAuthorChannelId(
  reply: Record<string, unknown>
): string | undefined {
  const snippet = isRecord(reply.snippet) ? reply.snippet : undefined;
  const direct = getString(snippet?.authorChannelId);
  if (direct) return direct;
  const author = snippet?.authorChannelId;
  return isRecord(author) ? getString(author.value) : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function errorCode(error: unknown): string {
  if (error instanceof YouTubeAccountMismatchError) return 'account_mismatch';
  if (error instanceof AmbiguousWriteError) return 'ambiguous_write';
  if (error instanceof ApprovalMismatchError) return 'approval_mismatch';
  if (error instanceof PreflightBlockedError) return 'preflight_blocked';
  if (error instanceof ComposioCommandError) return 'composio_command_failed';
  if (error instanceof ComposioToolError) return 'composio_tool_failed';
  if (error instanceof InputValidationError) return 'invalid_input';
  return 'adapter_error';
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

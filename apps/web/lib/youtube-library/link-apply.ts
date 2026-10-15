import { createHash } from 'node:crypto';
import {
  inspectYouTubeLink,
  parseHttpUrl,
  sameResource,
  type YouTubeLinkPlan,
} from './link-inspect';

export const YOUTUBE_LINK_WRITE_SCOPE =
  'https://www.googleapis.com/auth/youtube.upload';
export const YOUTUBE_LINK_APPLY_SCOPE = 'single-item-description-link' as const;

export type YouTubeLinkOpStatus =
  | 'attempted'
  | 'verified'
  | 'failed'
  | 'rolled-back';
export type YouTubeLinkApplyFailure =
  | 'invalid-approval'
  | 'stale-approval'
  | 'insufficient-permissions'
  | 'revoked-auth'
  | 'redirect-loop'
  | 'description-too-long'
  | 'not-imported'
  | 'provider-error'
  | 'readback-mismatch'
  | 'rollback-conflict'
  | 'destination-unverified';

export interface YouTubeLinkSourceVersion {
  readonly etag: string | null;
  readonly descriptionSha256: string;
}
export interface YouTubeLinkApproval {
  readonly approved: true;
  readonly scope: typeof YOUTUBE_LINK_APPLY_SCOPE;
  readonly videoId: string;
  readonly sourceVersion: YouTubeLinkSourceVersion;
  readonly proposedDescriptionSha256: string;
  readonly expectedUrl: string;
}
export interface YouTubeVideoSnippetRecord {
  readonly id: string;
  readonly etag: string | null;
  readonly snippet: {
    readonly title: string;
    readonly description: string;
    readonly categoryId: string | null;
    readonly tags?: readonly string[];
    readonly defaultLanguage?: string | null;
    readonly defaultAudioLanguage?: string | null;
    readonly channelId?: string | null;
  };
}
export interface YouTubeSnippetWriter {
  getVideo(videoId: string): Promise<YouTubeVideoSnippetRecord | null>;
  updateVideo(input: {
    readonly videoId: string;
    readonly etag: string | null;
    readonly snippet: YouTubeVideoSnippetRecord['snippet'];
  }): Promise<YouTubeVideoSnippetRecord>;
}
export interface YouTubeLinkOperation {
  readonly videoId: string;
  readonly idempotencyKey: string;
  readonly status: YouTubeLinkOpStatus;
  readonly originalDescription: string;
  readonly proposedDescription: string;
  readonly sourceVersion: YouTubeLinkSourceVersion;
  readonly expectedUrl: string;
  readonly approval: YouTubeLinkApproval | null;
  readonly error: YouTubeLinkApplyFailure | null;
  readonly updatedAt: string;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
  readonly rollbackApproval?: {
    readonly approvedBy: string;
    readonly sourceVersion: YouTubeLinkSourceVersion;
    readonly approvedAt: string;
  };
}
export interface YouTubeLinkApplyStore {
  load(videoId: string): Promise<YouTubeLinkOperation | null>;
  save(operation: YouTubeLinkOperation): Promise<void>;
}
export type YouTubeLinkApplyResult =
  | {
      readonly ok: true;
      readonly status: YouTubeLinkOpStatus;
      readonly plan: YouTubeLinkPlan;
      readonly operation: YouTubeLinkOperation;
    }
  | {
      readonly ok: false;
      readonly error: YouTubeLinkApplyFailure;
      readonly plan?: YouTubeLinkPlan;
      readonly operation?: YouTubeLinkOperation;
    };

export function hashDescription(description: string): string {
  return createHash('sha256').update(description).digest('hex');
}
export function sourceVersionFor(
  description: string,
  etag: string | null
): YouTubeLinkSourceVersion {
  return { etag, descriptionSha256: hashDescription(description) };
}
export function createMemoryYouTubeLinkStore(
  seed: readonly YouTubeLinkOperation[] = []
): YouTubeLinkApplyStore {
  const rows = new Map(seed.map(item => [item.videoId, item]));
  return {
    load: async videoId => rows.get(videoId) ?? null,
    save: async operation => {
      rows.set(operation.videoId, operation);
    },
  };
}
export function approvalFromPlan(input: {
  readonly videoId: string;
  readonly plan: YouTubeLinkPlan;
  readonly sourceVersion: YouTubeLinkSourceVersion;
}): YouTubeLinkApproval {
  return {
    approved: true,
    scope: YOUTUBE_LINK_APPLY_SCOPE,
    videoId: input.videoId,
    sourceVersion: input.sourceVersion,
    proposedDescriptionSha256: hashDescription(input.plan.proposedDescription),
    expectedUrl: input.plan.expectedUrl,
  };
}

function sameExpected(left: string, right: string): boolean {
  const a = parseHttpUrl(left);
  const b = parseHttpUrl(right);
  return Boolean(a && b && sameResource(a, b));
}

function authError(error: unknown): YouTubeLinkApplyFailure | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  const status = Number((error as { status: number }).status);
  const reason = String((error as { reason?: string | null }).reason ?? '');
  if (
    status === 401 ||
    reason === 'authError' ||
    reason === 'invalidCredentials'
  ) {
    return 'revoked-auth';
  }
  if (
    status === 403 ||
    reason === 'insufficientPermissions' ||
    reason === 'forbidden'
  ) {
    return 'insufficient-permissions';
  }
  return null;
}

async function writeAndReadback(
  writer: YouTubeSnippetWriter,
  live: YouTubeVideoSnippetRecord,
  description: string
): Promise<
  | { ok: true; live: YouTubeVideoSnippetRecord }
  | { ok: false; error: YouTubeLinkApplyFailure }
> {
  try {
    await writer.updateVideo({
      videoId: live.id,
      etag: live.etag,
      snippet: {
        title: live.snippet.title,
        description,
        categoryId: live.snippet.categoryId,
        ...(live.snippet.tags ? { tags: live.snippet.tags } : {}),
        ...(live.snippet.defaultLanguage
          ? { defaultLanguage: live.snippet.defaultLanguage }
          : {}),
        ...(live.snippet.defaultAudioLanguage
          ? { defaultAudioLanguage: live.snippet.defaultAudioLanguage }
          : {}),
        ...(live.snippet.channelId
          ? { channelId: live.snippet.channelId }
          : {}),
      },
    });
  } catch (error) {
    const conflict =
      error &&
      typeof error === 'object' &&
      'status' in error &&
      error.status === 412;
    return {
      ok: false,
      error: conflict
        ? 'stale-approval'
        : (authError(error) ?? 'provider-error'),
    };
  }
  try {
    const readback = await writer.getVideo(live.id);
    if (readback?.snippet.description !== description) {
      return { ok: false, error: 'readback-mismatch' };
    }
    return { ok: true, live: readback };
  } catch {
    return { ok: false, error: 'readback-mismatch' };
  }
}

export async function applyYouTubeLink(input: {
  readonly videoId: string;
  readonly videoUrl: string;
  readonly expectedUrl: string;
  readonly destinationUrl?: string | null;
  readonly extraHosts?: readonly string[];
  readonly approval: YouTubeLinkApproval | null;
  readonly auth:
    | { readonly state: 'ok'; readonly scopes: readonly string[] }
    | { readonly state: 'revoked' | 'missing' };
  readonly writer: YouTubeSnippetWriter;
  readonly store: YouTubeLinkApplyStore;
  readonly now?: Date;
  readonly approvedBy?: string;
}): Promise<YouTubeLinkApplyResult> {
  const now = input.now ?? new Date();
  if (input.auth.state !== 'ok') return { ok: false, error: 'revoked-auth' };
  if (!input.auth.scopes.includes(YOUTUBE_LINK_WRITE_SCOPE)) {
    return { ok: false, error: 'insufficient-permissions' };
  }
  const approval = input.approval;
  if (
    !approval?.approved ||
    approval.scope !== YOUTUBE_LINK_APPLY_SCOPE ||
    approval.videoId !== input.videoId ||
    !sameExpected(approval.expectedUrl, input.expectedUrl)
  ) {
    return { ok: false, error: 'invalid-approval' };
  }
  let live: YouTubeVideoSnippetRecord | null;
  try {
    live = await input.writer.getVideo(input.videoId);
  } catch (error) {
    return { ok: false, error: authError(error) ?? 'provider-error' };
  }
  if (!live) return { ok: false, error: 'not-imported' };
  const liveVersion = sourceVersionFor(live.snippet.description, live.etag);
  const existing = await input.store.load(input.videoId);
  const sameApproval =
    existing?.approval &&
    existing.approval.sourceVersion.descriptionSha256 ===
      approval.sourceVersion.descriptionSha256 &&
    existing.approval.sourceVersion.etag === approval.sourceVersion.etag &&
    existing.approval.proposedDescriptionSha256 ===
      approval.proposedDescriptionSha256;
  const alreadyApplied =
    sameApproval &&
    liveVersion.descriptionSha256 === approval.proposedDescriptionSha256;
  if (alreadyApplied && existing.status === 'verified') {
    return {
      ok: true,
      status: 'verified',
      operation: existing,
      plan: inspectYouTubeLink({
        description: live.snippet.description,
        expectedUrl: input.expectedUrl,
        videoUrl: input.videoUrl,
      }),
    };
  }
  if (
    !alreadyApplied &&
    (liveVersion.descriptionSha256 !==
      approval.sourceVersion.descriptionSha256 ||
      liveVersion.etag !== approval.sourceVersion.etag)
  ) {
    return { ok: false, error: 'stale-approval' };
  }
  const inspectInput = {
    description: live.snippet.description,
    expectedUrl: input.expectedUrl,
    videoUrl: input.videoUrl,
    destinationUrl: input.destinationUrl,
    extraHosts: input.extraHosts,
  };
  const plan = inspectYouTubeLink(inspectInput);
  if (
    plan.blockedReason === 'redirect-loop' ||
    plan.blockedReason === 'description-too-long'
  ) {
    return { ok: false, error: plan.blockedReason, plan };
  }
  if (
    hashDescription(plan.proposedDescription) !==
    approval.proposedDescriptionSha256
  ) {
    return { ok: false, error: 'stale-approval', plan };
  }
  const idempotencyKey = `youtube-link-apply:${input.videoId}:${approval.sourceVersion.descriptionSha256}:${approval.proposedDescriptionSha256}`;
  const save = async (
    status: YouTubeLinkOpStatus,
    error: YouTubeLinkApplyFailure | null
  ) => {
    const operation: YouTubeLinkOperation = {
      videoId: input.videoId,
      idempotencyKey,
      status,
      originalDescription: sameApproval
        ? existing.originalDescription
        : live.snippet.description,
      proposedDescription: plan.proposedDescription,
      sourceVersion: sameApproval ? existing.sourceVersion : liveVersion,
      expectedUrl: input.expectedUrl,
      approval,
      error,
      updatedAt: now.toISOString(),
      approvedBy: input.approvedBy ?? existing?.approvedBy,
      approvedAt: sameApproval ? existing.approvedAt : now.toISOString(),
    };
    await input.store.save(operation);
    return operation;
  };
  if (plan.status === 'unknown')
    return { ok: false, error: 'destination-unverified', plan };
  if (plan.action === 'none') {
    const operation = await save('verified', null);
    return { ok: true, status: 'verified', plan, operation };
  }
  await save('attempted', null);
  const written = await writeAndReadback(
    input.writer,
    live,
    plan.proposedDescription
  );
  if (!written.ok) {
    const failed = await save('failed', written.error);
    const restored = await restoreDescription(input.writer, failed);
    if (!restored.ok) {
      const conflicted = await save('failed', 'rollback-conflict');
      return {
        ok: false,
        error: 'rollback-conflict',
        plan,
        operation: conflicted,
      };
    }
    return { ok: false, error: written.error, plan, operation: failed };
  }
  const verifiedPlan = inspectYouTubeLink({
    ...inspectInput,
    description: written.live.snippet.description,
  });
  if (verifiedPlan.status !== 'verified') {
    const failed = await save('failed', 'destination-unverified');
    return {
      ok: false,
      error: 'destination-unverified',
      plan: verifiedPlan,
      operation: failed,
    };
  }
  const operation = await save('verified', null);
  return { ok: true, status: 'verified', plan: verifiedPlan, operation };
}

/** Restore only our own write, using a fresh ETag to protect concurrent edits. */
async function restoreDescription(
  writer: YouTubeSnippetWriter,
  operation: YouTubeLinkOperation
) {
  try {
    const current = await writer.getVideo(operation.videoId);
    if (!current) return { ok: false as const };
    if (current.snippet.description === operation.originalDescription)
      return { ok: true as const };
    if (
      current.snippet.description !== operation.proposedDescription ||
      !current.etag
    )
      return { ok: false as const };
    return await writeAndReadback(
      writer,
      current,
      operation.originalDescription
    );
  } catch {
    return { ok: false as const };
  }
}

export async function rollbackYouTubeLink(input: {
  readonly videoId: string;
  readonly operationKey: string;
  readonly sourceVersion: YouTubeLinkSourceVersion;
  readonly approvedBy: string;
  readonly writer: YouTubeSnippetWriter;
  readonly store: YouTubeLinkApplyStore;
}): Promise<{ ok: true } | { ok: false; error: YouTubeLinkApplyFailure }> {
  const operation = await input.store.load(input.videoId);
  if (!operation || operation.idempotencyKey !== input.operationKey)
    return { ok: false, error: 'invalid-approval' };
  const current = await input.writer.getVideo(input.videoId);
  if (
    !current ||
    current.etag !== input.sourceVersion.etag ||
    hashDescription(current.snippet.description) !==
      input.sourceVersion.descriptionSha256 ||
    current.snippet.description !== operation.proposedDescription
  )
    return { ok: false, error: 'rollback-conflict' };
  const attempted = {
    ...operation,
    rollbackApproval: {
      approvedBy: input.approvedBy,
      sourceVersion: input.sourceVersion,
      approvedAt: new Date().toISOString(),
    },
  };
  await input.store.save(attempted);
  const restored = current.etag
    ? await writeAndReadback(
        input.writer,
        current,
        operation.originalDescription
      )
    : { ok: false as const };
  await input.store.save({
    ...attempted,
    status: restored.ok ? 'rolled-back' : 'failed',
    error: restored.ok ? null : 'rollback-conflict',
    updatedAt: new Date().toISOString(),
  });
  return restored.ok ? { ok: true } : { ok: false, error: 'rollback-conflict' };
}

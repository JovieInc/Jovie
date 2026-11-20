import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  contentRecordEvents,
  contentRecordLive,
} from '@/lib/db/schema/content-records';
import { getDeployedBuildInfo } from '@/lib/observability/build-info';
import { resolveContentApprover } from './access.server';
import { type ContentKindDefinition, gateContentRecord } from './kind';
import {
  type ContentReviewIdentity,
  contentApprovalProof,
  contentReviewIdentity,
} from './publication';
import {
  ContentAuthorizationError,
  ContentConflictError,
  ContentPublicationUncertainError,
  ContentValidationError,
} from './store-errors';
import { getContentVersion } from './store-versions.server';

export type ContentPublicationEvent = typeof contentRecordEvents.$inferSelect;

async function readLiveVersionId(
  kind: string,
  key: string
): Promise<string | null> {
  const [row] = await db
    .select({ versionId: contentRecordLive.versionId })
    .from(contentRecordLive)
    .where(
      and(
        eq(contentRecordLive.kind, kind),
        eq(contentRecordLive.recordKey, key)
      )
    )
    .limit(1);
  return row?.versionId ?? null;
}

export async function readEvent(
  id: string
): Promise<ContentPublicationEvent | null> {
  const [row] = await db
    .select()
    .from(contentRecordEvents)
    .where(eq(contentRecordEvents.id, id))
    .limit(1);
  return row ?? null;
}

export async function targetVersion<T>(
  definition: ContentKindDefinition<T>,
  key: string,
  id: string
) {
  const target = await getContentVersion(id);
  if (!target || target.kind !== definition.kind || target.key !== key) {
    throw new ContentConflictError(
      `Version ${id} is not a ${definition.kind}/${key} version`
    );
  }
  if (target.schemaVersion !== definition.schemaVersion) {
    throw new ContentConflictError(
      'Stored content schema revision changed; create a compatible version'
    );
  }
  return target;
}

const RENDER_SMOKE_TIMEOUT_MS = 5_000;

export async function runPublicationSmoke<T>(
  definition: ContentKindDefinition<T>,
  data: T,
  key: string,
  identity: ContentReviewIdentity
) {
  if (!definition.renderSmoke) {
    throw new ContentConflictError(
      'No same-version renderer evidence hook is registered; publication remains closed'
    );
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const observed = await Promise.race([
      definition.renderSmoke({
        data,
        key,
        identity,
        signal: controller.signal,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Render smoke deadline exceeded'));
        }, RENDER_SMOKE_TIMEOUT_MS);
      }),
    ]);
    if (
      !observed ||
      observed.reviewDigest !== identity.reviewDigest ||
      observed.versionId !== identity.versionId ||
      observed.renderBuildId !== identity.renderBuildId ||
      !Array.isArray(observed.errors) ||
      observed.errors.length !== 0
    ) {
      throw new Error(
        'Missing, failed or mismatched same-version render evidence'
      );
    }
  } catch (error) {
    throw new ContentValidationError([
      error instanceof Error ? error.message : 'Render smoke failed',
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Used by draft responses and the preview; never accepts a caller's renderer identity. */
export async function getContentReviewIdentity<T>(
  definition: ContentKindDefinition<T>,
  key: string,
  versionId: string
): Promise<ContentReviewIdentity | null> {
  const target = await targetVersion(definition, key, versionId);
  return contentReviewIdentity(
    target,
    await getDeployedBuildInfo(),
    await readLiveVersionId(definition.kind, key)
  );
}

/** Append a founder-authenticated decision to the existing immutable audit log. */
export async function approveContentVersion<T>(
  definition: ContentKindDefinition<T>,
  input: {
    readonly key: string;
    readonly versionId: string;
    readonly decisionId: string;
    readonly reviewDigest: string;
    readonly expectedLiveVersionId: string | null;
  },
  request: Request
): Promise<{ readonly id: string; readonly identity: ContentReviewIdentity }> {
  const founder = await resolveContentApprover(request);
  if (!founder.ok)
    throw new ContentAuthorizationError(founder.status, founder.error);
  const target = await targetVersion(definition, input.key, input.versionId);
  const checked = gateContentRecord(definition, input.key, target.data);
  if (!checked.ok) throw new ContentValidationError(checked.errors);
  const identity = contentReviewIdentity(
    target,
    await getDeployedBuildInfo(),
    input.expectedLiveVersionId
  );
  if (!identity || identity.reviewDigest !== input.reviewDigest) {
    throw new ContentConflictError(
      'Preview payload or renderer changed; review the exact version again'
    );
  }
  // The existing experiment workflow has no complete-arm decision receipt.
  if (
    target.data &&
    typeof target.data === 'object' &&
    'experiment' in target.data
  ) {
    throw new ContentConflictError(
      'A complete experiment-arm approval receipt is required'
    );
  }
  if (
    (await readLiveVersionId(definition.kind, input.key)) !==
    input.expectedLiveVersionId
  ) {
    throw new ContentConflictError('Live version changed after preview');
  }
  await runPublicationSmoke(definition, checked.data, input.key, identity);
  const reason = contentApprovalProof(identity);
  const matches = (event: ContentPublicationEvent) =>
    event.action === 'approve' &&
    event.kind === definition.kind &&
    event.recordKey === input.key &&
    event.toVersionId === target.id &&
    event.fromVersionId === input.expectedLiveVersionId &&
    event.actor === founder.actor &&
    event.reason === reason;
  const previous = await readEvent(input.decisionId);
  if (previous) {
    if (!matches(previous))
      throw new ContentConflictError('Decision id belongs to another approval');
    return { id: previous.id, identity };
  }
  try {
    await db
      .insert(contentRecordEvents)
      .values({
        id: input.decisionId,
        kind: definition.kind,
        recordKey: input.key,
        action: 'approve',
        fromVersionId: input.expectedLiveVersionId,
        toVersionId: target.id,
        actor: founder.actor,
        reason,
      })
      .onConflictDoNothing();
  } catch {
    // A transport failure does not establish that the insert failed.
  }
  const stored = await readEvent(input.decisionId);
  if (!stored) throw new ContentPublicationUncertainError(input.decisionId);
  if (!matches(stored))
    throw new ContentConflictError('Decision id belongs to another approval');
  return { id: stored.id, identity };
}

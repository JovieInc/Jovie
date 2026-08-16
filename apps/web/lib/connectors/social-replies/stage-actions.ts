import 'server-only';

import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { db } from '@/lib/db';
import { suggestedActions } from '@/lib/db/schema/connectors';
import {
  createReplyBatchFingerprint,
  type SocialReplyBatchRequest,
  type SocialReplyTarget,
  socialReplyBatchRequestSchema,
} from './contract';

export const SOCIAL_REPLY_ACTION_KIND = 'social.reply';
export const SOCIAL_REPLY_SIGNAL_TYPE = 'fan_reply';

export interface StagedSocialReplyAction {
  readonly id: string;
  readonly targetId: string;
  readonly status: 'created' | 'already-staged';
}

interface StageSocialReplyBatchInput {
  readonly appUserId: string;
  readonly profileId: string;
  readonly batch: unknown;
}

export interface SocialReplySuggestedActionRow {
  readonly id: string;
  readonly userId: string;
  readonly kind: typeof SOCIAL_REPLY_ACTION_KIND;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly signalType: typeof SOCIAL_REPLY_SIGNAL_TYPE;
  readonly sourceRefs: readonly Readonly<Record<string, unknown>>[];
  readonly rationale: string;
  readonly idempotencyKey: string;
  readonly sideEffects: readonly [];
}

function uuidFromKey(key: string): string {
  const hex = createHash('sha256').update(key).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function actionKey(userId: string, target: SocialReplyTarget): string {
  return [
    SOCIAL_REPLY_ACTION_KIND,
    userId,
    target.platform.toLowerCase(),
    target.targetId,
  ].join(':');
}

export function buildSocialReplySuggestedActionRows(
  userId: string,
  batch: SocialReplyBatchRequest
): SocialReplySuggestedActionRow[] {
  const draftFingerprint = createReplyBatchFingerprint(batch.targets);

  return batch.targets.map(target => {
    const idempotencyKey = actionKey(userId, target);
    return {
      id: uuidFromKey(idempotencyKey),
      userId,
      kind: SOCIAL_REPLY_ACTION_KIND,
      payload: {
        title: `Reply on ${target.platform}`,
        batchId: batch.batchId,
        draftFingerprint,
        platform: target.platform,
        sourceId: target.sourceId,
        targetId: target.targetId,
        sourceKind: target.sourceKind,
        sourceUrl: target.sourceUrl,
        draftedText: target.draftedText,
        baselineMetadata: target.baselineMetadata,
      },
      signalType: SOCIAL_REPLY_SIGNAL_TYPE,
      sourceRefs: [
        {
          platform: target.platform,
          sourceId: target.sourceId,
          targetId: target.targetId,
          sourceUrl: target.sourceUrl,
        },
      ],
      rationale:
        target.sourceKind === 'owned-audience'
          ? 'An unanswered fan comment has a reply ready for review.'
          : 'A relevant public conversation has a reply ready for review.',
      idempotencyKey,
      sideEffects: [],
    };
  });
}

/**
 * Persist a validated batch as pending Inbox work. This never calls a social
 * provider and never marks a reply approved or sent.
 */
export async function stageSocialReplyBatch(
  input: StageSocialReplyBatchInput
): Promise<{
  readonly batchId: string;
  readonly draftFingerprint: string;
  readonly actions: readonly StagedSocialReplyAction[];
}> {
  const batch = socialReplyBatchRequestSchema.parse(input.batch);
  if (batch.mode !== 'draft') {
    throw new Error('Inbox staging accepts draft batches only');
  }

  const access = await getExactProfileAccess(
    db,
    input.appUserId,
    input.profileId
  );
  if (!access.ok) {
    throw new Error('Profile ownership required');
  }

  const inboxUserId = access.ownerUserId ?? input.appUserId;
  const rows = buildSocialReplySuggestedActionRows(inboxUserId, batch);
  const inserted = await db
    .insert(suggestedActions)
    .values(rows)
    .onConflictDoNothing({ target: suggestedActions.id })
    .returning({ id: suggestedActions.id });

  const ids = rows.map(row => row.id);
  const persisted = await db
    .select({ id: suggestedActions.id })
    .from(suggestedActions)
    .where(
      and(
        eq(suggestedActions.userId, inboxUserId),
        inArray(suggestedActions.id, ids)
      )
    );
  const persistedIds = new Set(persisted.map(row => row.id));
  if (persistedIds.size !== rows.length) {
    throw new Error('Social reply staging persistence check failed');
  }

  const insertedIds = new Set(inserted.map(row => row.id));
  return {
    batchId: batch.batchId,
    draftFingerprint: createReplyBatchFingerprint(batch.targets),
    actions: rows.map(row => {
      const payload = row.payload as { targetId: string };
      return {
        id: row.id,
        targetId: payload.targetId,
        status: insertedIds.has(row.id) ? 'created' : 'already-staged',
      };
    }),
  };
}

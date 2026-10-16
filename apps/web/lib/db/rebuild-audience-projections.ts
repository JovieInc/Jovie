import { and, asc, sql as drizzleSql, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTransaction } from '@/lib/db';
import { hasUnownedAudienceRelationship } from '@/lib/db/queries/analytics';
import {
  type HistoryEvent,
  type Payload,
  reconcileHistory,
} from './audience-history';
import {
  audienceActions,
  audienceMembers,
  audienceProjectionSnapshots,
  audienceReferrers,
} from './schema/analytics';

export const audienceProjectionOptions = z.object({
  profileId: z.uuid(),
  cursor: z.uuid().nullable().default(null),
  limit: z.number().int().min(1).max(100).default(10),
  apply: z.boolean().default(false),
});
const EVENT_LIMIT = 10000;

function legacyAction(row: HistoryEvent, memberId: string, profileId: string) {
  const payload = row.legacyPayload ?? {};
  const text = (key: string) =>
    payload[key] == null ? null : z.string().parse(payload[key]);
  return {
    id: row.id,
    audienceMemberId: memberId,
    creatorProfileId: profileId,
    label: String(row.label),
    timestamp: row.timestamp,
    legacyKey: row.legacyKey,
    legacyPayload: row.legacyPayload,
    emoji: text('emoji'),
    platform: text('platform'),
    eventType: text('eventType') ?? 'legacy',
    verb: text('verb'),
    confidence: text('confidence') ?? 'observed',
    sourceKind: text('sourceKind'),
    sourceLabel: text('sourceLabel'),
    objectType: text('objectType'),
    objectId: text('objectId'),
    objectLabel: text('objectLabel'),
    sourceLinkId: z.uuid().nullable().parse(text('sourceLinkId')),
    clickEventId: z.uuid().nullable().parse(text('clickEventId')),
    properties:
      payload.properties == null
        ? {}
        : z.record(z.string(), z.unknown()).parse(payload.properties),
    context:
      payload.context == null
        ? {}
        : z.record(z.string(), z.unknown()).parse(payload.context),
  };
}

async function rebuildMember(
  tx: DbOrTransaction,
  member: typeof audienceMembers.$inferSelect,
  apply: boolean
) {
  const [snapshot] = await tx
    .select()
    .from(audienceProjectionSnapshots)
    .where(eq(audienceProjectionSnapshots.audienceMemberId, member.id));
  const original = snapshot?.original ?? {
    latestActions: member.latestActions,
    referrerHistory: member.referrerHistory,
    latestActionLabel: member.latestActionLabel,
    latestReferrerUrl: member.latestReferrerUrl,
  };
  const actions = await tx
    .select()
    .from(audienceActions)
    .where(eq(audienceActions.audienceMemberId, member.id))
    .limit(EVENT_LIMIT + 1);
  const referrers = await tx
    .select()
    .from(audienceReferrers)
    .where(eq(audienceReferrers.audienceMemberId, member.id))
    .limit(EVENT_LIMIT + 1);
  if (actions.length > EVENT_LIMIT || referrers.length > EVENT_LIMIT)
    throw new Error('Member exceeds bounded event budget');
  if (
    actions.some(
      a =>
        a.creatorProfileId !== null &&
        a.creatorProfileId !== member.creatorProfileId
    )
  )
    throw new Error('Audience ownership mismatch');
  const actionPlan = reconcileHistory(
    original.latestActions,
    member.latestActions,
    actions,
    'action',
    member.id
  );
  const referrerPlan = reconcileHistory(
    original.referrerHistory,
    member.referrerHistory,
    referrers,
    'referrer',
    member.id
  );
  const actionInserts = actionPlan.inserts.map(row =>
    legacyAction(row, member.id, member.creatorProfileId)
  );
  // Never attach a historical relationship to another tenant, even if the FK exists.
  const relationships = [...actions, ...actionInserts].filter(
    row => row.sourceLinkId || row.clickEventId
  );
  if (
    relationships.length &&
    (await hasUnownedAudienceRelationship(
      tx,
      member.creatorProfileId,
      relationships
    ))
  ) {
    throw new Error('Historical relationship ownership mismatch');
  }
  const firstText = (projection: Payload[], key: string) =>
    typeof projection[0]?.[key] === 'string'
      ? String(projection[0][key])
      : null;
  const projection = {
    latestActions: actionPlan.projection,
    referrerHistory: referrerPlan.projection,
    latestActionLabel:
      firstText(actionPlan.projection, 'label') ??
      firstText(actionPlan.projection, 'action') ??
      (actionPlan.projection.length === 0 ? member.latestActionLabel : null),
    latestReferrerUrl:
      firstText(referrerPlan.projection, 'url') ??
      (referrerPlan.projection.length === 0 ? member.latestReferrerUrl : null),
  };
  if (apply) {
    await tx
      .insert(audienceProjectionSnapshots)
      .values({ audienceMemberId: member.id, original })
      .onConflictDoNothing();
    if (actionInserts.length)
      await tx.insert(audienceActions).values(actionInserts);
    if (referrerPlan.inserts.length)
      await tx.insert(audienceReferrers).values(
        referrerPlan.inserts.map(row => ({
          id: row.id,
          audienceMemberId: member.id,
          url: String(row.url),
          source: row.source == null ? null : z.string().parse(row.source),
          timestamp: row.timestamp,
          legacyKey: row.legacyKey,
          legacyPayload: row.legacyPayload,
        }))
      );
    for (const [table, updates] of [
      [audienceActions, actionPlan.updates],
      [audienceReferrers, referrerPlan.updates],
    ] as const) {
      if (!updates.length) continue;
      await tx.execute(drizzleSql`
        UPDATE ${table} AS event SET legacy_key = value.key, legacy_payload = value.payload
        FROM jsonb_to_recordset(${JSON.stringify(updates.map(row => ({ id: row.id, key: row.legacyKey, payload: row.legacyPayload })))}::jsonb)
          AS value(id uuid, key text, payload jsonb)
        WHERE event.id = value.id AND event.audience_member_id = ${member.id}::uuid
      `);
    }
    await tx
      .update(audienceMembers)
      .set(projection)
      .where(eq(audienceMembers.id, member.id));
  }
  return {
    memberId: member.id,
    applied: apply,
    actions: {
      before: actions.length,
      imported: actionInserts.length,
      matched: actionPlan.updates.length,
      reconciled: actionPlan.reconciled,
    },
    referrers: {
      before: referrers.length,
      imported: referrerPlan.inserts.length,
      matched: referrerPlan.updates.length,
      reconciled: referrerPlan.reconciled,
    },
  };
}

/** Call inside withSystemIngestionSession. Locks serialize rebuilds and live member writes. */
export async function rebuildAudienceProjections(
  tx: DbOrTransaction,
  input: z.input<typeof audienceProjectionOptions>
) {
  const { profileId, cursor, limit, apply } =
    audienceProjectionOptions.parse(input);
  await tx.execute("SET LOCAL lock_timeout = '5s'");
  await tx.execute("SET LOCAL statement_timeout = '30s'");
  const members = await tx
    .select()
    .from(audienceMembers)
    .where(
      and(
        eq(audienceMembers.creatorProfileId, profileId),
        cursor ? gt(audienceMembers.id, cursor) : undefined
      )
    )
    .orderBy(asc(audienceMembers.id))
    .limit(limit)
    .for('update');
  const reports = [];
  for (const member of members)
    reports.push(await rebuildMember(tx, member, apply));
  return {
    scanned: members.length,
    nextCursor: members.at(-1)?.id ?? null,
    reports,
  };
}

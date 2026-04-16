import { eq } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { audienceActions, audienceMembers } from '@/lib/db/schema/analytics';
import { getAudienceEventSentenceText } from './activity-grammar';
import type {
  AudienceEventConfidence,
  AudienceEventType,
  AudienceObjectType,
  AudienceSourceType,
} from './activity-types';
import { isRecentSourceScanDuplicate } from './source-links';

const DEFAULT_DUPLICATE_WINDOW_MS = 10_000;

function trimHistory<T>(items: T[], maxItems = 3) {
  return items.slice(0, maxItems);
}

export interface RecordAudienceEventInput {
  readonly creatorProfileId: string;
  readonly audienceMemberId: string;
  readonly eventType: AudienceEventType;
  readonly verb?: string | null;
  readonly confidence?: AudienceEventConfidence;
  readonly sourceKind?: AudienceSourceType | null;
  readonly sourceLabel?: string | null;
  readonly sourceLinkId?: string | null;
  readonly objectType?: AudienceObjectType | null;
  readonly objectId?: string | null;
  readonly objectLabel?: string | null;
  readonly clickEventId?: string | null;
  readonly platform?: string | null;
  readonly properties?: Record<string, unknown>;
  readonly context?: Record<string, unknown>;
  readonly timestamp?: Date;
  readonly duplicateWindowMs?: number;
}

function compactActionProjection(
  input: RecordAudienceEventInput,
  label: string
) {
  const sourceLinkCode =
    typeof input.properties?.code === 'string'
      ? input.properties.code
      : undefined;

  return {
    label,
    eventType: input.eventType,
    verb: input.verb ?? undefined,
    confidence: input.confidence ?? 'observed',
    sourceKind: input.sourceKind ?? undefined,
    sourceLabel: input.sourceLabel ?? undefined,
    sourceLinkId: input.sourceLinkId ?? undefined,
    sourceLinkCode,
    objectType: input.objectType ?? undefined,
    objectId: input.objectId ?? undefined,
    objectLabel: input.objectLabel ?? undefined,
    platform: input.platform ?? undefined,
    properties: input.properties ?? undefined,
    context: input.context ?? undefined,
    timestamp: (input.timestamp ?? new Date()).toISOString(),
  };
}

export async function recordAudienceEvent(
  tx: DbOrTransaction,
  input: RecordAudienceEventInput
): Promise<void> {
  const now = input.timestamp ?? new Date();
  if (input.eventType === 'source_scanned' && input.sourceLinkId) {
    const duplicateWindowMs =
      input.duplicateWindowMs ?? DEFAULT_DUPLICATE_WINDOW_MS;
    const isDuplicate = await isRecentSourceScanDuplicate(tx, {
      audienceMemberId: input.audienceMemberId,
      sourceLinkId: input.sourceLinkId,
      since: new Date(now.getTime() - duplicateWindowMs),
    });

    if (isDuplicate) return;
  }

  const label =
    getAudienceEventSentenceText({
      eventType: input.eventType,
      verb: input.verb,
      confidence: input.confidence,
      sourceKind: input.sourceKind,
      sourceLabel: input.sourceLabel,
      objectType: input.objectType,
      objectId: input.objectId,
      objectLabel: input.objectLabel,
      platform: input.platform,
      properties: input.properties,
      context: input.context,
    }) ?? 'Someone Interacted';

  await tx.insert(audienceActions).values({
    creatorProfileId: input.creatorProfileId,
    audienceMemberId: input.audienceMemberId,
    label,
    platform: input.platform ?? null,
    eventType: input.eventType,
    verb: input.verb ?? null,
    confidence: input.confidence ?? 'observed',
    sourceKind: input.sourceKind ?? null,
    sourceLabel: input.sourceLabel ?? null,
    sourceLinkId: input.sourceLinkId ?? null,
    objectType: input.objectType ?? null,
    objectId: input.objectId ?? null,
    objectLabel: input.objectLabel ?? null,
    clickEventId: input.clickEventId ?? null,
    properties: input.properties ?? {},
    context: input.context ?? {},
    timestamp: now,
  });

  const [member] = await tx
    .select({ latestActions: audienceMembers.latestActions })
    .from(audienceMembers)
    .where(eq(audienceMembers.id, input.audienceMemberId))
    .limit(1);

  const existingActions = Array.isArray(member?.latestActions)
    ? member.latestActions
    : [];
  const latestActions = trimHistory(
    [compactActionProjection(input, label), ...existingActions],
    5
  );

  await tx
    .update(audienceMembers)
    .set({
      latestActions,
      latestActionLabel: label,
      lastSeenAt: now,
      updatedAt: now,
    })
    .where(eq(audienceMembers.id, input.audienceMemberId));
}

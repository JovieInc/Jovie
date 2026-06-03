import { and, sql as drizzleSql, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type MemoryAsset,
  type MemoryAssetEntityMention,
  type MemoryEnrichmentJob,
  type MemoryEntity,
  type MemoryEntityAlias,
  type MemoryEntityEdge,
  type MemoryEntityIdentity,
  type MemoryEntityStatus,
  type MemoryEvent,
  type MemoryEventParticipant,
  type MemoryObservation,
  type MemoryObservationStatus,
  type MemoryOpportunity,
  type MemoryOpportunityStatus,
  type MemorySourceRecord,
  memoryAssetEntityMentions,
  memoryAssets,
  memoryEnrichmentJobs,
  memoryEntities,
  memoryEntityAliases,
  memoryEntityEdges,
  memoryEntityIdentities,
  memoryEventParticipants,
  memoryEvents,
  memoryObservations,
  memoryOpportunities,
  memorySourceRecords,
} from '@/lib/db/schema/memory';
import {
  mergeMetadata,
  normalizeMemoryName,
  sanitizeSourceInput,
} from './evidence';
import type {
  MemoryAssetInput,
  MemoryAssetMentionInput,
  MemoryEdgeInput,
  MemoryEnrichmentJobInput,
  MemoryEntityCandidate,
  MemoryEventInput,
  MemoryEventParticipantInput,
  MemoryGraphSnapshot,
  MemoryObservationInput,
  MemoryOpportunityInput,
  MemoryProviderIdentityInput,
  MemoryScope,
  MemorySourceInput,
  MemoryStore,
} from './types';

export class DrizzleMemoryStore implements MemoryStore {
  async upsertSourceRecord(
    scope: MemoryScope,
    input: MemorySourceInput
  ): Promise<MemorySourceRecord> {
    const sanitized = sanitizeSourceInput(input);
    const externalId = scopedSourceExternalId(scope, sanitized.externalId);
    const metadata = sourceMetadata(sanitized);
    const [record] = await db
      .insert(memorySourceRecords)
      .values({
        userId: scope.userId,
        creatorProfileId: scope.creatorProfileId,
        sourceType: sanitized.sourceType,
        externalId,
        metadata,
      })
      .onConflictDoUpdate({
        target: [
          memorySourceRecords.userId,
          memorySourceRecords.sourceType,
          memorySourceRecords.externalId,
        ],
        set: {
          metadata: drizzleSql<
            Record<string, unknown>
          >`coalesce(${memorySourceRecords.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return mustReturn(record, 'memory source record');
  }

  async createAsset(
    scope: MemoryScope,
    input: MemoryAssetInput
  ): Promise<MemoryAsset> {
    await this.requireSource(scope, input.sourceRecordId);
    const [asset] = await db
      .insert(memoryAssets)
      .values({
        userId: scope.userId,
        creatorProfileId: scope.creatorProfileId,
        sourceRecordId: input.sourceRecordId,
        kind: input.kind,
        url: input.url ?? null,
        storageKey: input.storageKey ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return mustReturn(asset, 'memory asset');
  }

  async findEntityByIdentity(
    scope: MemoryScope,
    identity: Pick<MemoryProviderIdentityInput, 'provider' | 'providerId'>
  ): Promise<MemoryEntity | null> {
    const [row] = await db
      .select({ entity: memoryEntities })
      .from(memoryEntityIdentities)
      .innerJoin(
        memoryEntities,
        eq(memoryEntityIdentities.entityId, memoryEntities.id)
      )
      .where(
        and(
          scopedEntity(scope),
          eq(memoryEntityIdentities.provider, identity.provider),
          eq(memoryEntityIdentities.providerId, identity.providerId)
        )
      )
      .limit(1);
    return row?.entity ?? null;
  }

  async findEntityByName(
    scope: MemoryScope,
    type: MemoryEntity['type'],
    name: string
  ): Promise<MemoryEntity | null> {
    const normalized = normalizeMemoryName(name);
    const [row] = await db
      .select({ entity: memoryEntities })
      .from(memoryEntities)
      .leftJoin(
        memoryEntityAliases,
        eq(memoryEntityAliases.entityId, memoryEntities.id)
      )
      .where(
        and(
          scopedEntity(scope),
          eq(memoryEntities.type, type),
          or(
            drizzleSql`lower(${memoryEntities.primaryName}) = ${normalized}`,
            drizzleSql`lower(${memoryEntityAliases.alias}) = ${normalized}`
          )
        )
      )
      .limit(1);
    return row?.entity ?? null;
  }

  async getEntity(
    scope: MemoryScope,
    entityId: string
  ): Promise<MemoryEntity | null> {
    const [entity] = await db
      .select()
      .from(memoryEntities)
      .where(and(scopedEntity(scope), eq(memoryEntities.id, entityId)))
      .limit(1);
    return entity ?? null;
  }

  async createEntity(
    scope: MemoryScope,
    input: Pick<MemoryEntityCandidate, 'metadata' | 'name' | 'status' | 'type'>
  ): Promise<MemoryEntity> {
    const [entity] = await db
      .insert(memoryEntities)
      .values({
        userId: scope.userId,
        creatorProfileId: scope.creatorProfileId,
        type: input.type,
        status: input.status ?? 'candidate',
        primaryName: input.name,
        metadata: input.metadata ?? {},
      })
      .returning();
    return mustReturn(entity, 'memory entity');
  }

  async updateEntity(
    scope: MemoryScope,
    entityId: string,
    input: {
      readonly metadata?: Record<string, unknown>;
      readonly primaryName?: string | null;
      readonly status?: MemoryEntityStatus;
    }
  ): Promise<MemoryEntity> {
    const current = await this.getEntity(scope, entityId);
    if (!current) throw new Error(`Memory entity not found: ${entityId}`);
    const [entity] = await db
      .update(memoryEntities)
      .set({
        status: input.status ?? current.status,
        primaryName:
          input.primaryName === undefined
            ? current.primaryName
            : input.primaryName,
        metadata: mergeMetadata(current.metadata, input.metadata ?? {}),
        updatedAt: new Date(),
      })
      .where(and(scopedEntity(scope), eq(memoryEntities.id, entityId)))
      .returning();
    return mustReturn(entity, 'memory entity');
  }

  async addEntityIdentity(
    scope: MemoryScope,
    entityId: string,
    input: MemoryProviderIdentityInput
  ): Promise<MemoryEntityIdentity> {
    await this.requireEntity(scope, entityId);
    const [identity] = await db
      .insert(memoryEntityIdentities)
      .values({
        entityId,
        provider: input.provider,
        providerId: input.providerId,
        confidence: input.confidence ?? null,
        metadata: input.metadata ?? {},
      })
      .onConflictDoUpdate({
        target: [
          memoryEntityIdentities.entityId,
          memoryEntityIdentities.provider,
          memoryEntityIdentities.providerId,
        ],
        set: {
          confidence: input.confidence ?? null,
          metadata: input.metadata ?? {},
        },
      })
      .returning();
    return mustReturn(identity, 'memory entity identity');
  }

  async addEntityAlias(
    scope: MemoryScope,
    entityId: string,
    alias: string,
    source?: string | null
  ): Promise<MemoryEntityAlias> {
    await this.requireEntity(scope, entityId);
    const existing = await db
      .select()
      .from(memoryEntityAliases)
      .where(
        and(
          eq(memoryEntityAliases.entityId, entityId),
          drizzleSql`lower(${memoryEntityAliases.alias}) = ${normalizeMemoryName(
            alias
          )}`,
          source
            ? eq(memoryEntityAliases.source, source)
            : isNull(memoryEntityAliases.source)
        )
      )
      .limit(1);
    if (existing[0]) return existing[0];

    const [row] = await db
      .insert(memoryEntityAliases)
      .values({ entityId, alias, source: source ?? null })
      .returning();
    return mustReturn(row, 'memory entity alias');
  }

  async createObservation(
    scope: MemoryScope,
    input: MemoryObservationInput
  ): Promise<MemoryObservation> {
    await this.requireEntity(scope, input.entityId);
    await this.requireSource(scope, input.sourceRecordId);
    const [observation] = await db
      .insert(memoryObservations)
      .values({
        userId: scope.userId,
        entityId: input.entityId,
        sourceRecordId: input.sourceRecordId,
        status: input.status ?? 'proposed',
        fact: input.fact,
        confidence: input.confidence ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return mustReturn(observation, 'memory observation');
  }

  async updateObservationStatus(
    scope: MemoryScope,
    observationId: string,
    status: MemoryObservationStatus
  ): Promise<MemoryObservation> {
    const [current] = await db
      .select()
      .from(memoryObservations)
      .where(
        and(
          eq(memoryObservations.userId, scope.userId),
          eq(memoryObservations.id, observationId)
        )
      )
      .limit(1);
    const existing = mustReturn(current, 'memory observation');
    await this.requireEntity(scope, existing.entityId);

    const [observation] = await db
      .update(memoryObservations)
      .set({ status })
      .where(
        and(
          eq(memoryObservations.userId, scope.userId),
          eq(memoryObservations.id, observationId)
        )
      )
      .returning();
    return mustReturn(observation, 'memory observation');
  }

  async createEdge(
    scope: MemoryScope,
    input: MemoryEdgeInput
  ): Promise<MemoryEntityEdge> {
    await this.requireEntity(scope, input.fromEntityId);
    await this.requireEntity(scope, input.toEntityId);
    const existing = await db
      .select()
      .from(memoryEntityEdges)
      .where(
        and(
          eq(memoryEntityEdges.userId, scope.userId),
          eq(memoryEntityEdges.fromEntityId, input.fromEntityId),
          eq(memoryEntityEdges.toEntityId, input.toEntityId),
          eq(memoryEntityEdges.relation, input.relation)
        )
      )
      .limit(1);
    if (existing[0]) return existing[0];

    const [edge] = await db
      .insert(memoryEntityEdges)
      .values({
        userId: scope.userId,
        fromEntityId: input.fromEntityId,
        toEntityId: input.toEntityId,
        relation: input.relation,
        weight: input.weight ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return mustReturn(edge, 'memory entity edge');
  }

  async createAssetMention(
    scope: MemoryScope,
    input: MemoryAssetMentionInput
  ): Promise<MemoryAssetEntityMention> {
    await this.requireAsset(scope, input.assetId);
    await this.requireEntity(scope, input.entityId);
    const existing = await db
      .select()
      .from(memoryAssetEntityMentions)
      .where(
        and(
          eq(memoryAssetEntityMentions.assetId, input.assetId),
          eq(memoryAssetEntityMentions.entityId, input.entityId)
        )
      )
      .limit(1);
    if (existing[0]) return existing[0];

    const [mention] = await db
      .insert(memoryAssetEntityMentions)
      .values({
        assetId: input.assetId,
        entityId: input.entityId,
        mentionType: input.mentionType ?? null,
        confidence: input.confidence ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return mustReturn(mention, 'memory asset mention');
  }

  async createEvent(
    scope: MemoryScope,
    input: MemoryEventInput
  ): Promise<MemoryEvent> {
    await this.requireSource(scope, input.sourceRecordId);
    const [event] = await db
      .insert(memoryEvents)
      .values({
        userId: scope.userId,
        creatorProfileId: scope.creatorProfileId,
        sourceRecordId: input.sourceRecordId,
        title: input.title ?? null,
        occurredAt: input.occurredAt ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return mustReturn(event, 'memory event');
  }

  async createEventParticipant(
    scope: MemoryScope,
    input: MemoryEventParticipantInput
  ): Promise<MemoryEventParticipant> {
    await this.requireEvent(scope, input.eventId);
    await this.requireEntity(scope, input.entityId);
    const existing = await db
      .select()
      .from(memoryEventParticipants)
      .where(
        and(
          eq(memoryEventParticipants.eventId, input.eventId),
          eq(memoryEventParticipants.entityId, input.entityId),
          input.role
            ? eq(memoryEventParticipants.role, input.role)
            : drizzleSql`${memoryEventParticipants.role} is null`
        )
      )
      .limit(1);
    if (existing[0]) return existing[0];

    const [participant] = await db
      .insert(memoryEventParticipants)
      .values({
        eventId: input.eventId,
        entityId: input.entityId,
        role: input.role ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return mustReturn(participant, 'memory event participant');
  }

  async createEnrichmentJob(
    scope: MemoryScope,
    input: MemoryEnrichmentJobInput
  ): Promise<MemoryEnrichmentJob> {
    await this.requireEntity(scope, input.targetEntityId);
    const [job] = await db
      .insert(memoryEnrichmentJobs)
      .values({
        userId: scope.userId,
        targetEntityId: input.targetEntityId,
        jobType: input.jobType,
        status: input.status ?? 'pending',
        input: input.input ?? {},
      })
      .returning();
    return mustReturn(job, 'memory enrichment job');
  }

  async completeEnrichmentJob(
    scope: MemoryScope,
    jobId: string,
    output: Record<string, unknown>,
    status = 'completed'
  ): Promise<MemoryEnrichmentJob> {
    const [current] = await db
      .select()
      .from(memoryEnrichmentJobs)
      .where(
        and(
          eq(memoryEnrichmentJobs.userId, scope.userId),
          eq(memoryEnrichmentJobs.id, jobId)
        )
      )
      .limit(1);
    const existing = mustReturn(current, 'memory enrichment job');
    if (!existing.targetEntityId) {
      throw new Error(`Memory enrichment job has no target entity: ${jobId}`);
    }
    await this.requireEntity(scope, existing.targetEntityId);

    const [job] = await db
      .update(memoryEnrichmentJobs)
      .set({ output, status, completedAt: new Date() })
      .where(
        and(
          eq(memoryEnrichmentJobs.userId, scope.userId),
          eq(memoryEnrichmentJobs.id, jobId)
        )
      )
      .returning();
    return mustReturn(job, 'memory enrichment job');
  }

  async createOpportunity(
    scope: MemoryScope,
    input: MemoryOpportunityInput
  ): Promise<MemoryOpportunity> {
    if (input.entityId) await this.requireEntity(scope, input.entityId);
    const dedupKey = getDedupKey(input.metadata ?? null);
    if (dedupKey) {
      const [existing] = await db
        .select()
        .from(memoryOpportunities)
        .where(
          and(
            eq(memoryOpportunities.userId, scope.userId),
            eq(memoryOpportunities.creatorProfileId, scope.creatorProfileId),
            drizzleSql`${memoryOpportunities.metadata}->>'dedupKey' = ${dedupKey}`
          )
        )
        .limit(1);
      if (existing) return existing;
    }

    const [opportunity] = await db
      .insert(memoryOpportunities)
      .values({
        userId: scope.userId,
        creatorProfileId: scope.creatorProfileId,
        entityId: input.entityId ?? null,
        title: input.title,
        description: input.description ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return mustReturn(opportunity, 'memory opportunity');
  }

  async updateOpportunityStatus(
    scope: MemoryScope,
    opportunityId: string,
    status: MemoryOpportunityStatus
  ): Promise<MemoryOpportunity> {
    const [opportunity] = await db
      .update(memoryOpportunities)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(memoryOpportunities.userId, scope.userId),
          eq(memoryOpportunities.creatorProfileId, scope.creatorProfileId),
          eq(memoryOpportunities.id, opportunityId)
        )
      )
      .returning();
    return mustReturn(opportunity, 'memory opportunity');
  }

  async getGraph(
    scope: MemoryScope,
    entityId?: string
  ): Promise<MemoryGraphSnapshot> {
    const entities = await this.listEntities(scope, entityId);
    if (entities.length === 0) return emptyGraph();
    const entityIds = entities.map(entity => entity.id);

    const [
      aliases,
      identities,
      observations,
      edges,
      assetMentions,
      eventParticipants,
      opportunities,
    ] = await Promise.all([
      this.listAliases(entityIds),
      this.listIdentities(entityIds),
      db
        .select()
        .from(memoryObservations)
        .where(
          and(
            eq(memoryObservations.userId, scope.userId),
            inArray(memoryObservations.entityId, entityIds)
          )
        ),
      db
        .select()
        .from(memoryEntityEdges)
        .where(
          and(
            eq(memoryEntityEdges.userId, scope.userId),
            inArray(memoryEntityEdges.fromEntityId, entityIds),
            inArray(memoryEntityEdges.toEntityId, entityIds)
          )
        ),
      this.listAssetMentions(entityIds),
      db
        .select()
        .from(memoryEventParticipants)
        .where(inArray(memoryEventParticipants.entityId, entityIds)),
      db
        .select()
        .from(memoryOpportunities)
        .where(
          and(
            eq(memoryOpportunities.userId, scope.userId),
            eq(memoryOpportunities.creatorProfileId, scope.creatorProfileId),
            entityId
              ? eq(memoryOpportunities.entityId, entityId)
              : drizzleSql`true`
          )
        ),
    ]);
    const assetIds = uniqueStrings(
      assetMentions.map(mention => mention.assetId)
    );
    const eventIds = uniqueStrings(
      eventParticipants.map(participant => participant.eventId)
    );
    const [assets, events] = await Promise.all([
      entityId
        ? assetIds.length > 0
          ? db
              .select()
              .from(memoryAssets)
              .where(
                and(
                  eq(memoryAssets.userId, scope.userId),
                  eq(memoryAssets.creatorProfileId, scope.creatorProfileId),
                  inArray(memoryAssets.id, assetIds)
                )
              )
          : Promise.resolve([])
        : db
            .select()
            .from(memoryAssets)
            .where(
              and(
                eq(memoryAssets.userId, scope.userId),
                eq(memoryAssets.creatorProfileId, scope.creatorProfileId)
              )
            ),
      entityId
        ? eventIds.length > 0
          ? db
              .select()
              .from(memoryEvents)
              .where(
                and(
                  eq(memoryEvents.userId, scope.userId),
                  eq(memoryEvents.creatorProfileId, scope.creatorProfileId),
                  inArray(memoryEvents.id, eventIds)
                )
              )
          : Promise.resolve([])
        : db
            .select()
            .from(memoryEvents)
            .where(
              and(
                eq(memoryEvents.userId, scope.userId),
                eq(memoryEvents.creatorProfileId, scope.creatorProfileId)
              )
            ),
    ]);
    const scopedEventIds = new Set(events.map(event => event.id));

    return {
      entities,
      aliases,
      identities,
      observations,
      edges,
      assets,
      assetMentions,
      events,
      eventParticipants: eventParticipants.filter(participant =>
        scopedEventIds.has(participant.eventId)
      ),
      opportunities,
    };
  }

  private async requireEntity(
    scope: MemoryScope,
    entityId: string
  ): Promise<MemoryEntity> {
    const entity = await this.getEntity(scope, entityId);
    if (!entity) throw new Error(`Memory entity not found: ${entityId}`);
    return entity;
  }

  private async requireAsset(
    scope: MemoryScope,
    assetId: string
  ): Promise<MemoryAsset> {
    const [asset] = await db
      .select()
      .from(memoryAssets)
      .where(
        and(
          eq(memoryAssets.userId, scope.userId),
          eq(memoryAssets.creatorProfileId, scope.creatorProfileId),
          eq(memoryAssets.id, assetId)
        )
      )
      .limit(1);
    return mustReturn(asset, 'memory asset');
  }

  private async requireSource(
    scope: MemoryScope,
    sourceRecordId: string
  ): Promise<MemorySourceRecord> {
    const [source] = await db
      .select()
      .from(memorySourceRecords)
      .where(
        and(
          eq(memorySourceRecords.userId, scope.userId),
          eq(memorySourceRecords.creatorProfileId, scope.creatorProfileId),
          eq(memorySourceRecords.id, sourceRecordId)
        )
      )
      .limit(1);
    return mustReturn(source, 'memory source record');
  }

  private async requireEvent(
    scope: MemoryScope,
    eventId: string
  ): Promise<MemoryEvent> {
    const [event] = await db
      .select()
      .from(memoryEvents)
      .where(
        and(
          eq(memoryEvents.userId, scope.userId),
          eq(memoryEvents.creatorProfileId, scope.creatorProfileId),
          eq(memoryEvents.id, eventId)
        )
      )
      .limit(1);
    return mustReturn(event, 'memory event');
  }

  private async listEntities(
    scope: MemoryScope,
    entityId?: string
  ): Promise<MemoryEntity[]> {
    if (!entityId) {
      return db.select().from(memoryEntities).where(scopedEntity(scope));
    }

    const base = await this.getEntity(scope, entityId);
    if (!base) return [];
    const adjacent = await db
      .select()
      .from(memoryEntityEdges)
      .where(
        and(
          eq(memoryEntityEdges.userId, scope.userId),
          or(
            eq(memoryEntityEdges.fromEntityId, entityId),
            eq(memoryEntityEdges.toEntityId, entityId)
          )
        )
      );
    const ids = [
      ...new Set([
        entityId,
        ...adjacent.flatMap(edge => [edge.fromEntityId, edge.toEntityId]),
      ]),
    ];
    return db
      .select()
      .from(memoryEntities)
      .where(and(scopedEntity(scope), inArray(memoryEntities.id, ids)));
  }

  private async listAliases(
    entityIds: readonly string[]
  ): Promise<MemoryEntityAlias[]> {
    if (entityIds.length === 0) return [];
    return db
      .select()
      .from(memoryEntityAliases)
      .where(inArray(memoryEntityAliases.entityId, [...entityIds]));
  }

  private async listIdentities(
    entityIds: readonly string[]
  ): Promise<MemoryEntityIdentity[]> {
    if (entityIds.length === 0) return [];
    return db
      .select()
      .from(memoryEntityIdentities)
      .where(inArray(memoryEntityIdentities.entityId, [...entityIds]));
  }

  private async listAssetMentions(
    entityIds: readonly string[]
  ): Promise<MemoryAssetEntityMention[]> {
    if (entityIds.length === 0) return [];
    return db
      .select()
      .from(memoryAssetEntityMentions)
      .where(inArray(memoryAssetEntityMentions.entityId, [...entityIds]));
  }
}

function scopedEntity(scope: MemoryScope) {
  return and(
    eq(memoryEntities.userId, scope.userId),
    eq(memoryEntities.creatorProfileId, scope.creatorProfileId)
  );
}

function scopedSourceExternalId(
  scope: MemoryScope,
  externalId: string
): string {
  return `${scope.creatorProfileId}:${externalId}`;
}

function sourceMetadata(input: MemorySourceInput): Record<string, unknown> {
  return {
    ...(input.metadata ?? {}),
    sourceExternalId: input.externalId,
  };
}

function getDedupKey(metadata: Record<string, unknown> | null): string | null {
  const value = metadata?.dedupKey;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function mustReturn<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`Failed to write ${label}`);
  return value;
}

function emptyGraph(): MemoryGraphSnapshot {
  return {
    entities: [],
    aliases: [],
    identities: [],
    observations: [],
    edges: [],
    assets: [],
    assetMentions: [],
    events: [],
    eventParticipants: [],
    opportunities: [],
  };
}

export const defaultMemoryStore: MemoryStore = new DrizzleMemoryStore();

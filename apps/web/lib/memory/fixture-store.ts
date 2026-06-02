import type {
  MemoryAsset,
  MemoryAssetEntityMention,
  MemoryEnrichmentJob,
  MemoryEntity,
  MemoryEntityAlias,
  MemoryEntityEdge,
  MemoryEntityIdentity,
  MemoryEntityStatus,
  MemoryEvent,
  MemoryEventParticipant,
  MemoryObservation,
  MemoryObservationStatus,
  MemoryOpportunity,
  MemoryOpportunityStatus,
  MemorySourceRecord,
} from '@/lib/db/schema/memory';
import {
  assertMemoryScope,
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

type ScopedEntity = Pick<MemoryEntity, 'creatorProfileId' | 'id' | 'userId'>;

export class MemoryFixtureStore implements MemoryStore {
  readonly sourceRecords: MemorySourceRecord[] = [];
  readonly assets: MemoryAsset[] = [];
  readonly entities: MemoryEntity[] = [];
  readonly identities: MemoryEntityIdentity[] = [];
  readonly aliases: MemoryEntityAlias[] = [];
  readonly observations: MemoryObservation[] = [];
  readonly edges: MemoryEntityEdge[] = [];
  readonly assetMentions: MemoryAssetEntityMention[] = [];
  readonly events: MemoryEvent[] = [];
  readonly eventParticipants: MemoryEventParticipant[] = [];
  readonly enrichmentJobs: MemoryEnrichmentJob[] = [];
  readonly opportunities: MemoryOpportunity[] = [];

  private nextId = 1;

  async upsertSourceRecord(
    scope: MemoryScope,
    input: MemorySourceInput
  ): Promise<MemorySourceRecord> {
    assertMemoryScope(scope);
    const sanitized = sanitizeSourceInput(input);
    const existing = this.sourceRecords.find(
      record =>
        record.userId === scope.userId &&
        record.creatorProfileId === scope.creatorProfileId &&
        record.sourceType === sanitized.sourceType &&
        record.externalId === sanitized.externalId
    );
    const now = new Date();

    if (existing) {
      existing.metadata = mergeMetadata(
        existing.metadata,
        sanitized.metadata ?? {}
      );
      existing.updatedAt = now;
      return existing;
    }

    const record: MemorySourceRecord = {
      id: this.id('source'),
      userId: scope.userId,
      creatorProfileId: scope.creatorProfileId,
      sourceType: sanitized.sourceType,
      externalId: sanitized.externalId,
      metadata: sanitized.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.sourceRecords.push(record);
    return record;
  }

  async createAsset(
    scope: MemoryScope,
    input: MemoryAssetInput
  ): Promise<MemoryAsset> {
    assertMemoryScope(scope);
    this.requireSource(scope, input.sourceRecordId);
    const asset: MemoryAsset = {
      id: this.id('asset'),
      userId: scope.userId,
      creatorProfileId: scope.creatorProfileId,
      sourceRecordId: input.sourceRecordId,
      kind: input.kind,
      url: input.url ?? null,
      storageKey: input.storageKey ?? null,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };
    this.assets.push(asset);
    return asset;
  }

  async findEntityByIdentity(
    scope: MemoryScope,
    identity: Pick<MemoryProviderIdentityInput, 'provider' | 'providerId'>
  ): Promise<MemoryEntity | null> {
    assertMemoryScope(scope);
    const matchedIdentity = this.identities.find(
      row =>
        row.provider === identity.provider &&
        row.providerId === identity.providerId
    );
    if (!matchedIdentity) return null;
    return this.scopedEntity(scope, matchedIdentity.entityId);
  }

  async findEntityByName(
    scope: MemoryScope,
    type: MemoryEntity['type'],
    name: string
  ): Promise<MemoryEntity | null> {
    assertMemoryScope(scope);
    const normalized = normalizeMemoryName(name);
    const direct = this.entities.find(
      entity =>
        isSameScope(entity, scope) &&
        entity.type === type &&
        entity.status !== 'merged' &&
        normalizeMemoryName(entity.primaryName ?? '') === normalized
    );
    if (direct) return direct;

    const alias = this.aliases.find(
      row => normalizeMemoryName(row.alias) === normalized
    );
    if (!alias) return null;
    const entity = this.scopedEntity(scope, alias.entityId);
    return entity?.type === type ? entity : null;
  }

  async getEntity(
    scope: MemoryScope,
    entityId: string
  ): Promise<MemoryEntity | null> {
    assertMemoryScope(scope);
    return this.scopedEntity(scope, entityId);
  }

  async createEntity(
    scope: MemoryScope,
    input: Pick<MemoryEntityCandidate, 'metadata' | 'name' | 'status' | 'type'>
  ): Promise<MemoryEntity> {
    assertMemoryScope(scope);
    const now = new Date();
    const entity: MemoryEntity = {
      id: this.id('entity'),
      userId: scope.userId,
      creatorProfileId: scope.creatorProfileId,
      type: input.type,
      status: input.status ?? 'candidate',
      primaryName: input.name,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.entities.push(entity);
    return entity;
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
    const entity = this.requireEntity(scope, entityId);
    entity.status = input.status ?? entity.status;
    entity.primaryName =
      input.primaryName === undefined ? entity.primaryName : input.primaryName;
    entity.metadata = mergeMetadata(entity.metadata, input.metadata ?? {});
    entity.updatedAt = new Date();
    return entity;
  }

  async addEntityIdentity(
    scope: MemoryScope,
    entityId: string,
    input: MemoryProviderIdentityInput
  ): Promise<MemoryEntityIdentity> {
    this.requireEntity(scope, entityId);
    const existing = this.identities.find(
      identity =>
        identity.entityId === entityId &&
        identity.provider === input.provider &&
        identity.providerId === input.providerId
    );
    if (existing) return existing;

    const identity: MemoryEntityIdentity = {
      id: this.id('identity'),
      entityId,
      provider: input.provider,
      providerId: input.providerId,
      confidence: input.confidence ?? null,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };
    this.identities.push(identity);
    return identity;
  }

  async addEntityAlias(
    scope: MemoryScope,
    entityId: string,
    alias: string,
    source?: string | null
  ): Promise<MemoryEntityAlias> {
    this.requireEntity(scope, entityId);
    const existing = this.aliases.find(
      row =>
        row.entityId === entityId &&
        normalizeMemoryName(row.alias) === normalizeMemoryName(alias)
    );
    if (existing) return existing;

    const row: MemoryEntityAlias = {
      id: this.id('alias'),
      entityId,
      alias,
      source: source ?? null,
      createdAt: new Date(),
    };
    this.aliases.push(row);
    return row;
  }

  async createObservation(
    scope: MemoryScope,
    input: MemoryObservationInput
  ): Promise<MemoryObservation> {
    this.requireEntity(scope, input.entityId);
    this.requireSource(scope, input.sourceRecordId);
    const observation: MemoryObservation = {
      id: this.id('observation'),
      userId: scope.userId,
      entityId: input.entityId,
      sourceRecordId: input.sourceRecordId,
      status: input.status ?? 'proposed',
      fact: input.fact,
      confidence: input.confidence ?? null,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };
    this.observations.push(observation);
    return observation;
  }

  async updateObservationStatus(
    scope: MemoryScope,
    observationId: string,
    status: MemoryObservationStatus
  ): Promise<MemoryObservation> {
    const observation = this.observations.find(
      row => row.id === observationId && row.userId === scope.userId
    );
    if (!observation) {
      throw new Error(`Memory observation not found: ${observationId}`);
    }
    this.requireEntity(scope, observation.entityId);
    observation.status = status;
    return observation;
  }

  async createEdge(
    scope: MemoryScope,
    input: MemoryEdgeInput
  ): Promise<MemoryEntityEdge> {
    this.requireEntity(scope, input.fromEntityId);
    this.requireEntity(scope, input.toEntityId);
    const existing = this.edges.find(
      edge =>
        edge.userId === scope.userId &&
        edge.fromEntityId === input.fromEntityId &&
        edge.toEntityId === input.toEntityId &&
        edge.relation === input.relation
    );
    if (existing) return existing;

    const edge: MemoryEntityEdge = {
      id: this.id('edge'),
      userId: scope.userId,
      fromEntityId: input.fromEntityId,
      toEntityId: input.toEntityId,
      relation: input.relation,
      weight: input.weight ?? null,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };
    this.edges.push(edge);
    return edge;
  }

  async createAssetMention(
    scope: MemoryScope,
    input: MemoryAssetMentionInput
  ): Promise<MemoryAssetEntityMention> {
    this.requireAsset(scope, input.assetId);
    this.requireEntity(scope, input.entityId);
    const existing = this.assetMentions.find(
      mention =>
        mention.assetId === input.assetId && mention.entityId === input.entityId
    );
    if (existing) return existing;

    const mention: MemoryAssetEntityMention = {
      id: this.id('asset-mention'),
      assetId: input.assetId,
      entityId: input.entityId,
      mentionType: input.mentionType ?? null,
      confidence: input.confidence ?? null,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };
    this.assetMentions.push(mention);
    return mention;
  }

  async createEvent(
    scope: MemoryScope,
    input: MemoryEventInput
  ): Promise<MemoryEvent> {
    this.requireSource(scope, input.sourceRecordId);
    const event: MemoryEvent = {
      id: this.id('event'),
      userId: scope.userId,
      creatorProfileId: scope.creatorProfileId,
      sourceRecordId: input.sourceRecordId,
      title: input.title ?? null,
      occurredAt: input.occurredAt ?? null,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };
    this.events.push(event);
    return event;
  }

  async createEventParticipant(
    scope: MemoryScope,
    input: MemoryEventParticipantInput
  ): Promise<MemoryEventParticipant> {
    this.requireEvent(scope, input.eventId);
    this.requireEntity(scope, input.entityId);
    const existing = this.eventParticipants.find(
      participant =>
        participant.eventId === input.eventId &&
        participant.entityId === input.entityId &&
        participant.role === (input.role ?? null)
    );
    if (existing) return existing;

    const participant: MemoryEventParticipant = {
      id: this.id('event-participant'),
      eventId: input.eventId,
      entityId: input.entityId,
      role: input.role ?? null,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };
    this.eventParticipants.push(participant);
    return participant;
  }

  async createEnrichmentJob(
    scope: MemoryScope,
    input: MemoryEnrichmentJobInput
  ): Promise<MemoryEnrichmentJob> {
    this.requireEntity(scope, input.targetEntityId);
    const job: MemoryEnrichmentJob = {
      id: this.id('enrichment-job'),
      userId: scope.userId,
      targetEntityId: input.targetEntityId,
      jobType: input.jobType,
      status: input.status ?? 'pending',
      input: input.input ?? {},
      output: {},
      createdAt: new Date(),
      completedAt: null,
    };
    this.enrichmentJobs.push(job);
    return job;
  }

  async completeEnrichmentJob(
    scope: MemoryScope,
    jobId: string,
    output: Record<string, unknown>,
    status = 'completed'
  ): Promise<MemoryEnrichmentJob> {
    const job = this.enrichmentJobs.find(
      row => row.id === jobId && row.userId === scope.userId
    );
    if (!job) throw new Error(`Memory enrichment job not found: ${jobId}`);
    if (job.targetEntityId) {
      this.requireEntity(scope, job.targetEntityId);
    }
    job.output = output;
    job.status = status;
    job.completedAt = new Date();
    return job;
  }

  async createOpportunity(
    scope: MemoryScope,
    input: MemoryOpportunityInput
  ): Promise<MemoryOpportunity> {
    assertMemoryScope(scope);
    if (input.entityId) {
      this.requireEntity(scope, input.entityId);
    }
    const dedupKey = getDedupKey(input.metadata);
    if (dedupKey) {
      const existing = this.opportunities.find(
        opportunity =>
          opportunity.userId === scope.userId &&
          opportunity.creatorProfileId === scope.creatorProfileId &&
          getDedupKey(opportunity.metadata) === dedupKey
      );
      if (existing) return existing;
    }

    const now = new Date();
    const opportunity: MemoryOpportunity = {
      id: this.id('opportunity'),
      userId: scope.userId,
      creatorProfileId: scope.creatorProfileId,
      entityId: input.entityId ?? null,
      status: 'pending',
      title: input.title,
      description: input.description ?? null,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.opportunities.push(opportunity);
    return opportunity;
  }

  async updateOpportunityStatus(
    scope: MemoryScope,
    opportunityId: string,
    status: MemoryOpportunityStatus
  ): Promise<MemoryOpportunity> {
    const opportunity = this.opportunities.find(
      row =>
        row.id === opportunityId &&
        row.userId === scope.userId &&
        row.creatorProfileId === scope.creatorProfileId
    );
    if (!opportunity) {
      throw new Error(`Memory opportunity not found: ${opportunityId}`);
    }
    opportunity.status = status;
    opportunity.updatedAt = new Date();
    return opportunity;
  }

  async getGraph(
    scope: MemoryScope,
    entityId?: string
  ): Promise<MemoryGraphSnapshot> {
    assertMemoryScope(scope);
    const entityIds = entityId ? new Set([entityId]) : null;
    const scopedEntities = this.entities.filter(
      entity =>
        isSameScope(entity, scope) && (!entityIds || entityIds.has(entity.id))
    );
    const expandedEntityIds = new Set(scopedEntities.map(entity => entity.id));
    if (entityId) {
      for (const edge of this.edges.filter(
        row =>
          row.userId === scope.userId &&
          (row.fromEntityId === entityId || row.toEntityId === entityId)
      )) {
        expandedEntityIds.add(edge.fromEntityId);
        expandedEntityIds.add(edge.toEntityId);
      }
    }

    const entities = this.entities.filter(
      entity => isSameScope(entity, scope) && expandedEntityIds.has(entity.id)
    );
    const scopedEntityIds = new Set(entities.map(entity => entity.id));
    const assets = this.assets.filter(asset => isSameScope(asset, scope));
    const eventIds = new Set(
      this.events
        .filter(event => isSameScope(event, scope))
        .map(event => event.id)
    );

    return {
      entities,
      aliases: this.aliases.filter(alias =>
        scopedEntityIds.has(alias.entityId)
      ),
      identities: this.identities.filter(identity =>
        scopedEntityIds.has(identity.entityId)
      ),
      observations: this.observations.filter(
        observation =>
          observation.userId === scope.userId &&
          scopedEntityIds.has(observation.entityId)
      ),
      edges: this.edges.filter(
        edge =>
          edge.userId === scope.userId &&
          scopedEntityIds.has(edge.fromEntityId) &&
          scopedEntityIds.has(edge.toEntityId)
      ),
      assets,
      assetMentions: this.assetMentions.filter(mention =>
        scopedEntityIds.has(mention.entityId)
      ),
      events: this.events.filter(event => eventIds.has(event.id)),
      eventParticipants: this.eventParticipants.filter(
        participant =>
          eventIds.has(participant.eventId) &&
          scopedEntityIds.has(participant.entityId)
      ),
      opportunities: this.opportunities.filter(
        opportunity =>
          opportunity.userId === scope.userId &&
          opportunity.creatorProfileId === scope.creatorProfileId &&
          (!entityId || opportunity.entityId === entityId)
      ),
    };
  }

  private id(prefix: string): string {
    const id = `${prefix}_${this.nextId}`;
    this.nextId += 1;
    return id;
  }

  private requireSource(
    scope: MemoryScope,
    sourceRecordId: string
  ): MemorySourceRecord {
    const source = this.sourceRecords.find(
      row => row.id === sourceRecordId && isSameScope(row, scope)
    );
    if (!source) throw new Error(`Memory source not found: ${sourceRecordId}`);
    return source;
  }

  private scopedEntity(
    scope: MemoryScope,
    entityId: string
  ): MemoryEntity | null {
    return (
      this.entities.find(
        row => row.id === entityId && isSameScope(row, scope)
      ) ?? null
    );
  }

  private requireEntity(scope: MemoryScope, entityId: string): MemoryEntity {
    const entity = this.scopedEntity(scope, entityId);
    if (!entity) throw new Error(`Memory entity not found: ${entityId}`);
    return entity;
  }

  private requireAsset(scope: MemoryScope, assetId: string): MemoryAsset {
    const asset = this.assets.find(
      row => row.id === assetId && isSameScope(row, scope)
    );
    if (!asset) throw new Error(`Memory asset not found: ${assetId}`);
    return asset;
  }

  private requireEvent(scope: MemoryScope, eventId: string): MemoryEvent {
    const event = this.events.find(
      row => row.id === eventId && isSameScope(row, scope)
    );
    if (!event) throw new Error(`Memory event not found: ${eventId}`);
    return event;
  }
}

function isSameScope(row: ScopedEntity, scope: MemoryScope): boolean {
  return (
    row.userId === scope.userId &&
    row.creatorProfileId === scope.creatorProfileId
  );
}

function getDedupKey(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const value = metadata?.dedupKey;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

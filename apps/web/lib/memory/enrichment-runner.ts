import { defaultMemoryStore } from './drizzle-store';
import {
  assertMemoryScope,
  buildEvidenceMetadata,
  sanitizeSourceInput,
} from './evidence';
import type {
  MemoryEnrichmentProviderResponse,
  MemoryScope,
  MemoryStore,
} from './types';

export interface RunMemoryEnrichmentInput {
  readonly entityId: string;
  readonly responses: readonly MemoryEnrichmentProviderResponse[];
}

export interface RunMemoryEnrichmentResult {
  readonly jobIds: readonly string[];
  readonly observationIds: readonly string[];
}

export class MemoryEnrichmentRunner {
  constructor(private readonly store: MemoryStore = defaultMemoryStore) {}

  async run(
    scope: MemoryScope,
    input: RunMemoryEnrichmentInput
  ): Promise<RunMemoryEnrichmentResult> {
    assertMemoryScope(scope);
    const entity = await this.store.getEntity(scope, input.entityId);
    if (!entity) throw new Error(`Memory entity not found: ${input.entityId}`);

    const jobIds: string[] = [];
    const observationIds: string[] = [];

    for (const response of input.responses) {
      const source = await this.store.upsertSourceRecord(
        scope,
        sanitizeSourceInput({
          sourceType: 'web',
          externalId: `enrichment:${response.provider}:${response.providerId}`,
          metadata: {
            provider: response.provider,
            providerId: response.providerId,
            sourceUrl: response.sourceUrl,
            name: response.name,
            aliases: response.aliases,
          },
        })
      );
      const evidence = [{ sourceRecordId: source.id }];
      const job = await this.store.createEnrichmentJob(scope, {
        targetEntityId: input.entityId,
        jobType: `${response.provider}_enrichment`,
        input: {
          provider: response.provider,
          providerId: response.providerId,
        },
        status: 'running',
      });
      jobIds.push(job.id);

      await this.store.addEntityIdentity(scope, input.entityId, {
        provider: response.provider,
        providerId: response.providerId,
        confidence: '0.95',
        metadata: buildEvidenceMetadata(evidence),
      });

      for (const identity of response.identities ?? []) {
        await this.store.addEntityIdentity(scope, input.entityId, {
          ...identity,
          metadata: buildEvidenceMetadata(evidence, identity.metadata ?? {}),
        });
      }

      for (const alias of new Set([
        response.name,
        ...(response.aliases ?? []),
      ])) {
        await this.store.addEntityAlias(
          scope,
          input.entityId,
          alias,
          source.id
        );
      }

      const enrichmentMetadata = {
        enrichment: {
          provider: response.provider,
          providerId: response.providerId,
          sourceUrl: response.sourceUrl,
          description: response.description,
          birthDate: response.birthDate,
          releaseDate: response.releaseDate,
          ...(response.metadata ?? {}),
        },
      };
      await this.store.updateEntity(scope, input.entityId, {
        primaryName: response.name,
        metadata: buildEvidenceMetadata(evidence, enrichmentMetadata),
      });

      for (const fact of response.facts ?? []) {
        const observation = await this.store.createObservation(scope, {
          entityId: input.entityId,
          sourceRecordId: source.id,
          fact: fact.fact,
          confidence: fact.confidence ?? '0.90',
          metadata: buildEvidenceMetadata(evidence, fact.metadata ?? {}),
        });
        observationIds.push(observation.id);
      }

      if (response.birthDate) {
        const observation = await this.store.createObservation(scope, {
          entityId: input.entityId,
          sourceRecordId: source.id,
          fact: `${response.name} birthday is ${response.birthDate}`,
          confidence: '0.90',
          metadata: buildEvidenceMetadata(evidence, {
            kind: 'birthday',
            date: response.birthDate,
          }),
        });
        observationIds.push(observation.id);
      }

      await this.store.completeEnrichmentJob(scope, job.id, {
        provider: response.provider,
        providerId: response.providerId,
        observationIds,
      });
    }

    return { jobIds, observationIds };
  }
}

import { defaultMemoryStore } from './drizzle-store';
import {
  assertMemoryScope,
  buildEvidenceMetadata,
  mergeMetadata,
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
    let currentMetadata = entity.metadata ?? {};

    for (const response of input.responses) {
      const responseName = validResponseName(response);
      const responseObservationIds: string[] = [];
      const source = await this.store.upsertSourceRecord(
        scope,
        sanitizeSourceInput({
          sourceType: 'web',
          externalId: `enrichment:${response.provider}:${response.providerId}`,
          metadata: {
            provider: response.provider,
            providerId: response.providerId,
            sourceUrl: response.sourceUrl,
            name: responseName,
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

      try {
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
          responseName,
          ...(response.aliases ?? []).filter(isNonEmptyString),
        ])) {
          await this.store.addEntityAlias(
            scope,
            input.entityId,
            alias,
            source.id
          );
        }

        const enrichmentDetails = compactRecord({
          provider: response.provider,
          providerId: response.providerId,
          sourceUrl: response.sourceUrl,
          description: response.description,
          birthDate: response.birthDate,
          releaseDate: response.releaseDate,
          ...(response.metadata ?? {}),
        });
        const currentEnrichment = asRecord(currentMetadata.enrichment);
        const enrichmentMetadata = {
          enrichment: {
            ...currentEnrichment,
            [response.provider]: enrichmentDetails,
          },
        };
        const updated = await this.store.updateEntity(scope, input.entityId, {
          primaryName: responseName,
          metadata: mergeMetadata(
            currentMetadata,
            buildEvidenceMetadata(evidence, enrichmentMetadata)
          ),
        });
        currentMetadata = updated.metadata ?? {};

        for (const fact of response.facts ?? []) {
          const observation = await this.store.createObservation(scope, {
            entityId: input.entityId,
            sourceRecordId: source.id,
            fact: fact.fact,
            confidence: fact.confidence ?? '0.90',
            metadata: buildEvidenceMetadata(evidence, fact.metadata ?? {}),
          });
          observationIds.push(observation.id);
          responseObservationIds.push(observation.id);
        }

        if (response.birthDate) {
          const observation = await this.store.createObservation(scope, {
            entityId: input.entityId,
            sourceRecordId: source.id,
            fact: `${responseName} birthday is ${response.birthDate}`,
            confidence: '0.90',
            metadata: buildEvidenceMetadata(evidence, {
              kind: 'birthday',
              date: response.birthDate,
            }),
          });
          observationIds.push(observation.id);
          responseObservationIds.push(observation.id);
        }

        await this.store.completeEnrichmentJob(scope, job.id, {
          provider: response.provider,
          providerId: response.providerId,
          observationIds: responseObservationIds,
        });
      } catch (error) {
        await this.store.completeEnrichmentJob(
          scope,
          job.id,
          {
            provider: response.provider,
            providerId: response.providerId,
            error: errorMessage(error),
          },
          'failed'
        );
        throw error;
      }
    }

    return { jobIds, observationIds };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function compactRecord(
  value: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, child]) => child !== undefined)
  );
}

function validResponseName(response: MemoryEnrichmentProviderResponse): string {
  if (isNonEmptyString(response.name)) return response.name.trim();
  throw new Error(
    `Memory enrichment response is missing a name: ${response.provider}:${response.providerId}`
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

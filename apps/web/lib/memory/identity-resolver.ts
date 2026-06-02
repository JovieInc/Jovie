import { defaultMemoryStore } from './drizzle-store';
import {
  assertEvidence,
  assertMemoryScope,
  buildEvidenceMetadata,
  evidenceSourceIds,
} from './evidence';
import type { MemoryEntityCandidate, MemoryScope, MemoryStore } from './types';

export interface MemoryIdentityResolverResult {
  readonly entityId: string;
  readonly created: boolean;
}

export class MemoryIdentityResolver {
  constructor(private readonly store: MemoryStore = defaultMemoryStore) {}

  async resolve(
    scope: MemoryScope,
    candidate: MemoryEntityCandidate
  ): Promise<MemoryIdentityResolverResult> {
    assertMemoryScope(scope);
    assertEvidence(candidate.evidence, `entity ${candidate.name}`);

    const identityMatch = await this.findByIdentity(scope, candidate);
    const nameMatch =
      identityMatch ??
      (await this.store.findEntityByName(
        scope,
        candidate.type,
        candidate.name
      ));

    const entity =
      nameMatch ??
      (await this.store.createEntity(scope, {
        type: candidate.type,
        name: candidate.name,
        status: candidate.status ?? 'candidate',
        metadata: buildEvidenceMetadata(candidate.evidence, {
          ...(candidate.metadata ?? {}),
          confidence: candidate.confidence,
        }),
      }));

    const created = !nameMatch;
    await this.addAliases(scope, entity.id, candidate);
    await this.addIdentities(scope, entity.id, candidate);

    if (!created && candidate.metadata) {
      await this.store.updateEntity(scope, entity.id, {
        metadata: buildEvidenceMetadata(candidate.evidence, candidate.metadata),
      });
    }

    return { entityId: entity.id, created };
  }

  private async findByIdentity(
    scope: MemoryScope,
    candidate: MemoryEntityCandidate
  ) {
    for (const identity of candidate.identities ?? []) {
      const entity = await this.store.findEntityByIdentity(scope, identity);
      if (entity) return entity;
    }
    return null;
  }

  private async addAliases(
    scope: MemoryScope,
    entityId: string,
    candidate: MemoryEntityCandidate
  ): Promise<void> {
    const aliases = new Set([candidate.name, ...(candidate.aliases ?? [])]);
    for (const alias of aliases) {
      await this.store.addEntityAlias(
        scope,
        entityId,
        alias,
        evidenceSourceIds(candidate.evidence).join(',')
      );
    }
  }

  private async addIdentities(
    scope: MemoryScope,
    entityId: string,
    candidate: MemoryEntityCandidate
  ): Promise<void> {
    for (const identity of candidate.identities ?? []) {
      await this.store.addEntityIdentity(scope, entityId, {
        ...identity,
        metadata: buildEvidenceMetadata(candidate.evidence, {
          ...(identity.metadata ?? {}),
        }),
      });
    }
  }
}

import type {
  MemoryEntityStatus,
  MemoryObservationStatus,
  MemoryOpportunityStatus,
} from '@/lib/db/schema/memory';
import { defaultMemoryStore } from './drizzle-store';
import { assertMemoryScope } from './evidence';
import type { MemoryScope, MemoryStore } from './types';

export class MemoryReviewActions {
  constructor(private readonly store: MemoryStore = defaultMemoryStore) {}

  async setEntityStatus(
    scope: MemoryScope,
    entityId: string,
    status: Extract<MemoryEntityStatus, 'confirmed' | 'rejected'>
  ) {
    assertMemoryScope(scope);
    return this.store.updateEntity(scope, entityId, { status });
  }

  async setObservationStatus(
    scope: MemoryScope,
    observationId: string,
    status: Extract<MemoryObservationStatus, 'accepted' | 'rejected'>
  ) {
    assertMemoryScope(scope);
    return this.store.updateObservationStatus(scope, observationId, status);
  }

  async setOpportunityStatus(
    scope: MemoryScope,
    opportunityId: string,
    status: Extract<
      MemoryOpportunityStatus,
      'approved' | 'completed' | 'dismissed' | 'failed'
    >
  ) {
    assertMemoryScope(scope);
    return this.store.updateOpportunityStatus(scope, opportunityId, status);
  }
}

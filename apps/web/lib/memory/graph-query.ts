import { defaultMemoryStore } from './drizzle-store';
import { assertMemoryScope } from './evidence';
import type { MemoryGraphSnapshot, MemoryScope, MemoryStore } from './types';

export interface QueryMemoryGraphInput {
  readonly entityId?: string;
}

export async function queryMemoryGraph(
  scope: MemoryScope,
  input: QueryMemoryGraphInput = {},
  store: MemoryStore = defaultMemoryStore
): Promise<MemoryGraphSnapshot> {
  assertMemoryScope(scope);
  return store.getGraph(scope, input.entityId);
}

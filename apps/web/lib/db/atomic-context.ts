import { AsyncLocalStorage } from 'node:async_hooks';

export const atomicDbContext = new AsyncLocalStorage<{ actorId: string }>();

/** Fail closed even when a helper several calls deep tries to use the pool. */
export function assertGlobalDbAllowed(): void {
  if (atomicDbContext.getStore()) {
    throw new Error(
      'Atomic database operation must use its transaction handle'
    );
  }
}

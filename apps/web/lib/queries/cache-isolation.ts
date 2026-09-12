import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Account / profile / authorization-context fence for client caches.
 *
 * JOV-6186 owns isolation and stale-result fencing. Classified retries and
 * HUD transport stay with JOV-6185 — this module must not change Query
 * retry defaults.
 *
 * Identifiers are nonsecret (user id, profile id, impersonation subject).
 * Never put bearer tokens or raw credentials in keys or fence events.
 */

export type CacheFenceReason =
  | 'hydrate'
  | 'account-change'
  | 'sign-out'
  | 'profile-switch'
  | 'impersonation'
  | 'manual';

export interface CacheScope {
  readonly userId: string | null;
  readonly sessionId: string | null;
  readonly profileId: string | null;
  readonly impersonationSubject: string | null;
  readonly ready: boolean;
}

export interface CacheFenceEvent {
  readonly reason: CacheFenceReason;
  readonly changed: boolean;
  readonly generation: number;
  readonly previous: CacheScope;
  readonly next: CacheScope;
}

const EMPTY_SCOPE: CacheScope = {
  userId: null,
  sessionId: null,
  profileId: null,
  impersonationSubject: null,
  ready: false,
};

let scope: CacheScope = { ...EMPTY_SCOPE };
let generation = 0;
const listeners = new Set<(event: CacheFenceEvent) => void>();
const isolatedSurfaces = new Set<() => void>();

export function getCacheScope(): CacheScope {
  return { ...scope };
}

export function getCacheGeneration(): number {
  return generation;
}

export function subscribeCacheFence(
  listener: (event: CacheFenceEvent) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function registerIsolatedCacheSurface(clear: () => void): () => void {
  isolatedSurfaces.add(clear);
  return () => {
    isolatedSurfaces.delete(clear);
  };
}

export function classifyCacheScopeChange(
  previous: CacheScope,
  next: CacheScope
): CacheFenceReason | null {
  if (!previous.ready) {
    return next.ready ? 'hydrate' : null;
  }

  if (previous.userId && !next.userId) {
    return 'sign-out';
  }

  if (previous.userId !== next.userId && next.userId) {
    return 'account-change';
  }

  if (
    previous.sessionId !== next.sessionId &&
    (previous.userId !== null || next.userId !== null)
  ) {
    return 'account-change';
  }

  if (previous.impersonationSubject !== next.impersonationSubject) {
    return 'impersonation';
  }

  if (previous.profileId === next.profileId) {
    return null;
  }

  if (previous.profileId && next.profileId) {
    return 'profile-switch';
  }

  if (previous.profileId && !next.profileId && next.userId) {
    return 'profile-switch';
  }

  return 'hydrate';
}

function notifyFence(event: CacheFenceEvent): void {
  if (event.reason !== 'hydrate') {
    for (const clear of isolatedSurfaces) {
      clear();
    }
  }

  if (!event.changed) {
    return;
  }

  for (const listener of listeners) {
    listener(event);
  }
}

export function applyCacheScope(
  patch: Partial<CacheScope>
): CacheFenceEvent | null {
  const next: CacheScope = {
    ...scope,
    ...patch,
    ready: scope.ready || patch.ready === true,
  };
  const reason = classifyCacheScopeChange(scope, next);
  const previous = { ...scope };
  scope = next;

  if (reason === null) {
    return null;
  }

  if (reason === 'hydrate') {
    scope = { ...scope, ready: true };
    return {
      reason,
      changed: false,
      generation,
      previous,
      next: { ...scope },
    };
  }

  generation += 1;
  const event: CacheFenceEvent = {
    reason,
    changed: true,
    generation,
    previous,
    next: { ...scope },
  };
  notifyFence(event);
  return event;
}

export function advanceCacheGeneration(
  reason: Extract<CacheFenceReason, 'manual'> = 'manual'
): CacheFenceEvent {
  const previous = { ...scope };
  generation += 1;
  const event: CacheFenceEvent = {
    reason,
    changed: true,
    generation,
    previous,
    next: { ...scope },
  };
  notifyFence(event);
  return event;
}

export function resetCacheIsolationForTests(): void {
  scope = { ...EMPTY_SCOPE };
  generation = 0;
  listeners.clear();
}

export function withCacheScope(
  key: readonly unknown[],
  current: CacheScope = getCacheScope(),
  _untrustedExtras?: Record<string, unknown>
): readonly unknown[] {
  return [
    'jovie-scope',
    current.userId ?? 'anon',
    current.profileId ?? 'none',
    current.impersonationSubject ?? 'self',
    ...key,
  ] as const;
}

const SHAREABLE_PROFILE_SWITCH_ROOTS = new Set([
  'billing',
  'profile',
  'spotify',
  'apple-music',
  'handle',
  'health',
  'campaign-invites',
  'admin',
  'admin-releases',
  'admin-users',
  'waitlist',
  'usage',
  'pixels',
]);

export function isShareableAcrossProfileSwitch(queryKey: QueryKey): boolean {
  const root = queryKey[0];
  if (typeof root !== 'string') {
    return false;
  }
  if (root === 'chat') {
    return queryKey[1] === 'conversations' || queryKey[1] === 'usage';
  }
  if (root === 'user') {
    return queryKey[1] === 'settings';
  }
  return SHAREABLE_PROFILE_SWITCH_ROOTS.has(root);
}

export function copyShareableQueryData(
  from: QueryClient,
  to: QueryClient,
  reason: CacheFenceReason
): number {
  if (reason !== 'profile-switch') {
    return 0;
  }

  let copied = 0;
  for (const query of from.getQueryCache().getAll()) {
    if (
      query.state.data === undefined ||
      !isShareableAcrossProfileSwitch(query.queryKey)
    ) {
      continue;
    }
    to.setQueryData(query.queryKey, query.state.data);
    copied += 1;
  }
  return copied;
}

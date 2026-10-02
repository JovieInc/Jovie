import type { ReleaseApp, VerifiedMergeEvent } from './index';
import { parseVerifiedMergeEvent } from './prompt';

/**
 * Source-repository adapters for the canonical daily-post contract.
 *
 * One thin adapter per active product repository. Each adapter only maps
 * that repository's verified merge payload onto a `VerifiedMergeEvent`,
 * preserving source repository and app provenance; post creation, replay
 * deduplication and dismissal stay in the canonical
 * `ReleaseCommunicationsAdapter`, never in a source adapter.
 *
 * Inventory (issue-intake product repositories, mirroring the fleet
 * registry in scripts/fleet-gate/closure_health.py):
 * - JovieInc/Jovie        — product `jovie` (web, ios, electron apps)
 * - JovieInc/LogYourBody  — product `logyourbody`
 * - JovieInc/ovie         — product `ovie`
 */
export interface SourceRepositoryAdapter {
  /** Canonical `owner/name` the adapter accepts; other slugs never match. */
  readonly repository: string;
  /** Canonical product identity for the consolidated changelog. */
  readonly product: string;
  /** App used when the source payload does not declare one. */
  readonly defaultApp: ReleaseApp;
  toVerifiedMergeEvent(payload: unknown): VerifiedMergeEvent | null;
}

function sourceRepositoryAdapter(input: {
  repository: string;
  product: string;
  defaultApp: ReleaseApp;
}): SourceRepositoryAdapter {
  const { repository, product, defaultApp } = input;
  return {
    repository,
    product,
    defaultApp,
    toVerifiedMergeEvent(payload) {
      const event = parseVerifiedMergeEvent(payload);
      // A signed payload may not speak for another repository: the claimed
      // slug must match the adapter that vouches for it.
      if (!event || event.repository !== repository) return null;
      const declaredApp =
        payload &&
        typeof payload === 'object' &&
        typeof (payload as Record<string, unknown>).app === 'string' &&
        ((payload as Record<string, unknown>).app as string).trim();
      return {
        ...event,
        product,
        app: declaredApp ? event.app : defaultApp,
      };
    },
  };
}

export const SOURCE_REPOSITORY_ADAPTERS: readonly SourceRepositoryAdapter[] = [
  sourceRepositoryAdapter({
    repository: 'JovieInc/Jovie',
    product: 'jovie',
    defaultApp: 'web',
  }),
  sourceRepositoryAdapter({
    repository: 'JovieInc/LogYourBody',
    product: 'logyourbody',
    defaultApp: 'web',
  }),
  sourceRepositoryAdapter({
    repository: 'JovieInc/ovie',
    product: 'ovie',
    defaultApp: 'web',
  }),
];

/** Resolve the source adapter for a claimed repository slug. */
export function sourceAdapterForRepository(
  repository: unknown
): SourceRepositoryAdapter | null {
  if (typeof repository !== 'string') return null;
  return (
    SOURCE_REPOSITORY_ADAPTERS.find(
      adapter => adapter.repository === repository
    ) ?? null
  );
}

import { createHash } from 'node:crypto';
import { type Claim, getCapabilityRoutes } from './registry';

/**
 * Truth-sync digest (JOV-7247). Each claim hashes to a stable digest; a
 * change to a claim's statement, source, capability, or evidence changes its
 * hash, and every route bound to that capability is reported as affected so
 * the factory can re-render those pages.
 */

export const TRUTH_DIGEST_VERSION = 1;

export interface TruthDigest {
  readonly version: number;
  readonly claims: Readonly<Record<string, string>>;
  /** Claim id → capability id, so removed claims still resolve routes. */
  readonly capabilities: Readonly<Record<string, string>>;
}

export interface TruthDigestDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
  readonly affectedRoutes: readonly string[];
}

export function hashClaim(claim: Claim): string {
  const canonical = JSON.stringify([
    claim.id,
    claim.capabilityId,
    claim.statement,
    claim.kind,
    claim.source,
    claim.citation ?? null,
    claim.validUntil ?? null,
  ]);
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function buildTruthDigest(claims: readonly Claim[]): TruthDigest {
  const sorted = [...claims].sort((a, b) => a.id.localeCompare(b.id));
  return {
    version: TRUTH_DIGEST_VERSION,
    claims: Object.fromEntries(
      sorted.map(claim => [claim.id, hashClaim(claim)])
    ),
    capabilities: Object.fromEntries(
      sorted.map(claim => [claim.id, claim.capabilityId])
    ),
  };
}

export function diffTruthDigest(
  previous: TruthDigest | null,
  next: TruthDigest
): TruthDigestDiff {
  const before = previous?.claims ?? {};
  const added = Object.keys(next.claims).filter(id => !(id in before));
  const removed = Object.keys(before).filter(id => !(id in next.claims));
  const changed = Object.keys(next.claims).filter(
    id => id in before && before[id] !== next.claims[id]
  );
  const routes = new Set<string>();
  for (const id of [...added, ...changed]) {
    for (const route of getCapabilityRoutes(next.capabilities[id] ?? '')) {
      routes.add(route);
    }
  }
  for (const id of removed) {
    const capabilityId = previous?.capabilities[id] ?? '';
    for (const route of getCapabilityRoutes(capabilityId)) routes.add(route);
  }
  return { added, removed, changed, affectedRoutes: [...routes].sort() };
}

export function isDigestInSync(diff: TruthDigestDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0
  );
}

export function formatTruthDigest(digest: TruthDigest): string {
  return `${JSON.stringify(digest, null, 2)}\n`;
}

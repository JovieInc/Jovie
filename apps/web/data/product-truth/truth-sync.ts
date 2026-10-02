import { createHash } from 'node:crypto';
import { PROOF_REGISTRY, type ProofItem } from './proof';
import {
  type Capability,
  type Claim,
  getCapabilityRoutes,
  listCapabilities,
  ROUTE_CAPABILITY_BINDINGS,
} from './registry';

/**
 * Truth-sync digest (JOV-7247). Each claim hashes to a stable digest; a
 * change to a claim's statement, source, capability, or evidence changes its
 * hash, and every route bound to that capability is reported as affected so
 * the factory can re-render those pages.
 */

export const TRUTH_DIGEST_VERSION = 2;

export interface TruthDigest {
  readonly version: number;
  readonly claims: Readonly<Record<string, string>>;
  /** Claim id → capability id, so removed claims still resolve routes. */
  readonly capabilities: Readonly<Record<string, string>>;
  /** Capability id → full canonical capability record digest. */
  readonly capabilityDigests: Readonly<Record<string, string>>;
  /** Capability id → rendered routes, retained for removals and route moves. */
  readonly capabilityRoutes: Readonly<Record<string, readonly string[]>>;
  /** Proof id → full canonical evidence and authorization record digest. */
  readonly proofDigests: Readonly<Record<string, string>>;
  /** Proof id → owning capability, so removed evidence still resolves routes. */
  readonly proofCapabilities: Readonly<Record<string, string>>;
}

export interface TruthDigestDiff {
  readonly schemaChanged: boolean;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
  readonly addedCapabilities: readonly string[];
  readonly removedCapabilities: readonly string[];
  readonly changedCapabilities: readonly string[];
  readonly addedProofs: readonly string[];
  readonly removedProofs: readonly string[];
  readonly changedProofs: readonly string[];
  readonly affectedRoutes: readonly string[];
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)])
    );
  }
  return value;
}

function hashRecord(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)) ?? 'undefined')
    .digest('hex')
    .slice(0, 16);
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

/** Hashes every capability field that can change public product truth. */
export function hashCapability(capability: Capability): string {
  return hashRecord(capability);
}

/** Hashes the whole proof record, including authorization and freshness. */
export function hashProof(proof: ProofItem): string {
  return hashRecord(proof);
}

function routesForCapability(capability: Capability): readonly string[] {
  const routes = new Set<string>(capability.evidence.routes);
  for (const [route, capabilityId] of Object.entries(
    ROUTE_CAPABILITY_BINDINGS
  )) {
    if (capabilityId === capability.id) routes.add(route);
  }
  return [...routes].sort();
}

export function buildTruthDigest(
  claims: readonly Claim[],
  capabilities: readonly Capability[] = listCapabilities(),
  proofs: readonly ProofItem[] = PROOF_REGISTRY
): TruthDigest {
  const sorted = [...claims].sort((a, b) => a.id.localeCompare(b.id));
  const sortedCapabilities = [...capabilities].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  const claimsById = new Map(sorted.map(claim => [claim.id, claim]));
  const sortedProofs = [...proofs].sort((a, b) => a.id.localeCompare(b.id));
  return {
    version: TRUTH_DIGEST_VERSION,
    claims: Object.fromEntries(
      sorted.map(claim => [claim.id, hashClaim(claim)])
    ),
    capabilities: Object.fromEntries(
      sorted.map(claim => [claim.id, claim.capabilityId])
    ),
    capabilityDigests: Object.fromEntries(
      sortedCapabilities.map(capability => [
        capability.id,
        hashCapability(capability),
      ])
    ),
    capabilityRoutes: Object.fromEntries(
      sortedCapabilities.map(capability => [
        capability.id,
        routesForCapability(capability),
      ])
    ),
    proofDigests: Object.fromEntries(
      sortedProofs.map(proof => [proof.id, hashProof(proof)])
    ),
    proofCapabilities: Object.fromEntries(
      sortedProofs.flatMap(proof => {
        const capabilityId = claimsById.get(proof.claimId)?.capabilityId;
        return capabilityId ? [[proof.id, capabilityId]] : [];
      })
    ),
  };
}

function diffRecords(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>
) {
  const added = Object.keys(after).filter(id => !(id in before));
  const removed = Object.keys(before).filter(id => !(id in after));
  const changed = Object.keys(after).filter(
    id => id in before && before[id] !== after[id]
  );
  return { added, removed, changed };
}

export function diffTruthDigest(
  previous: TruthDigest | null,
  next: TruthDigest
): TruthDigestDiff {
  const before = previous?.claims ?? {};
  const claims = diffRecords(before, next.claims);
  const schemaChanged =
    previous !== null &&
    (previous.version !== next.version ||
      previous.capabilityDigests === undefined ||
      previous.capabilityRoutes === undefined ||
      previous.proofDigests === undefined ||
      previous.proofCapabilities === undefined);
  const comparableVersion =
    previous?.version === next.version && !schemaChanged;
  const capabilities = comparableVersion
    ? diffRecords(previous?.capabilityDigests ?? {}, next.capabilityDigests)
    : { added: [], removed: [], changed: [] };
  const proofs = comparableVersion
    ? diffRecords(previous?.proofDigests ?? {}, next.proofDigests)
    : { added: [], removed: [], changed: [] };
  const changedRouteCapabilities = comparableVersion
    ? Object.keys(next.capabilityRoutes).filter(
        id =>
          id in (previous?.capabilityRoutes ?? {}) &&
          JSON.stringify(previous?.capabilityRoutes[id]) !==
            JSON.stringify(next.capabilityRoutes[id])
      )
    : [];
  const changedCapabilities = [
    ...new Set([...capabilities.changed, ...changedRouteCapabilities]),
  ].sort();
  const routes = new Set<string>();
  const addCapabilityRoutes = (
    capabilityId: string,
    digest: TruthDigest | null
  ) => {
    const routesFor =
      digest?.capabilityRoutes?.[capabilityId] ??
      getCapabilityRoutes(capabilityId);
    for (const route of routesFor) routes.add(route);
  };
  for (const id of [...claims.added, ...claims.changed]) {
    addCapabilityRoutes(next.capabilities[id] ?? '', next);
    if (previous?.capabilities[id]) {
      addCapabilityRoutes(previous.capabilities[id], previous);
    }
  }
  for (const id of claims.removed) {
    const capabilityId = previous?.capabilities[id] ?? '';
    addCapabilityRoutes(capabilityId, previous);
  }
  for (const id of [...capabilities.added, ...changedCapabilities]) {
    addCapabilityRoutes(id, next);
    addCapabilityRoutes(id, previous);
  }
  for (const id of capabilities.removed) {
    addCapabilityRoutes(id, previous);
  }
  for (const id of [...proofs.added, ...proofs.changed]) {
    const capabilityId = next.proofCapabilities[id] ?? '';
    addCapabilityRoutes(capabilityId, next);
    const previousCapabilityId = previous?.proofCapabilities[id];
    if (previousCapabilityId)
      addCapabilityRoutes(previousCapabilityId, previous);
  }
  for (const id of proofs.removed) {
    const capabilityId = previous?.proofCapabilities[id] ?? '';
    addCapabilityRoutes(capabilityId, previous);
  }
  return {
    schemaChanged,
    ...claims,
    addedCapabilities: capabilities.added,
    removedCapabilities: capabilities.removed,
    changedCapabilities,
    addedProofs: proofs.added,
    removedProofs: proofs.removed,
    changedProofs: proofs.changed,
    affectedRoutes: [...routes].sort(),
  };
}

export function isDigestInSync(diff: TruthDigestDiff): boolean {
  return (
    !diff.schemaChanged &&
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0 &&
    diff.addedCapabilities.length === 0 &&
    diff.removedCapabilities.length === 0 &&
    diff.changedCapabilities.length === 0 &&
    diff.addedProofs.length === 0 &&
    diff.removedProofs.length === 0 &&
    diff.changedProofs.length === 0
  );
}

export function formatTruthDigest(digest: TruthDigest): string {
  return `${JSON.stringify(digest, null, 2)}\n`;
}

/**
 * Offline duplicate-candidate report for a discography export.
 *
 * READ-ONLY diagnostic over an authorized catalog export (plain JSON, no DB
 * client, no credentials, no mutation mode): it groups releases that collide
 * on an EXACT hard identifier inside a single profile — the same provider
 * album id, or the same UPC — and inventories the evidence a human needs to
 * decide whether to consolidate anything.
 *
 * The report only ever produces CANDIDATES. It never merges, deletes, or
 * ranks releases for deletion, and soft signals never group releases:
 *
 * - the same title never merges two releases (a remaster, a re-release and a
 *   later collaboration can share a title) — see release-identity.ts;
 * - a shared recording ISRC never merges two releases (one recording can
 *   legitimately appear on several distinct releases);
 * - matches across different profiles are never grouped (different artists).
 */

export interface DuplicateReportProviderLink {
  key: string;
  url: string;
}

export interface DuplicateReportTrack {
  id: string;
  title: string;
  isrc: string | null;
}

export interface DuplicateReportRelease {
  id: string;
  profileId: string;
  slug: string;
  title: string;
  releaseDate: string | null;
  upc: string | null;
  /** Lifecycle: when the release was soft-deleted, if it was. */
  deletedAt: string | null;
  providers: DuplicateReportProviderLink[];
  tracks?: DuplicateReportTrack[];
  /**
   * Optional dependent-object counts captured by the export (smart links,
   * campaign runs, …) so cleanup scoping does not need another export.
   */
  dependents?: Record<string, number>;
}

export interface DuplicateReportInput {
  releases: DuplicateReportRelease[];
}

export type DuplicateCandidateKind = 'provider-album-id' | 'upc';

export interface DuplicateReportProviderId {
  key: string;
  id: string | null;
  url: string;
}

export interface DuplicateReportReleaseSummary {
  id: string;
  slug: string;
  title: string;
  releaseDate: string | null;
  upc: string | null;
  deletedAt: string | null;
  /** Lifecycle derived from deletedAt; both states are reported, never pruned. */
  lifecycle: 'active' | 'deleted';
  /** Full provider links with the extracted album ids. */
  providerIds: DuplicateReportProviderId[];
  trackCount: number;
  trackIsrcs: string[];
  dependents: Record<string, number>;
}

/** One field whose values disagree across the colliding releases. */
export interface DuplicateReportEvidence {
  field: 'title' | 'releaseDate' | 'upc' | 'slug' | 'lifecycle';
  values: string[];
}

export interface DuplicateCandidateGroup {
  kind: DuplicateCandidateKind;
  /** The exact colliding value: '<provider-key>:<album-id>' or the UPC. */
  key: string;
  profileId: string;
  releases: DuplicateReportReleaseSummary[];
  /** Fields with more than one distinct value across the group. */
  conflictingEvidence: DuplicateReportEvidence[];
  dependentInventory: {
    totalTracks: number;
    totalProviderLinks: number;
    /** Sums of the export-provided dependent counts, by resource. */
    byResource: Record<string, number>;
  };
  /**
   * Always 'candidate'. The report does not execute consolidation; a human
   * decides what (if anything) happens to these rows.
   */
  disposition: 'candidate';
}

export interface DuplicateReport {
  releaseCount: number;
  profileCount: number;
  groups: DuplicateCandidateGroup[];
  groupsByKind: Record<DuplicateCandidateKind, number>;
}

/** Exact provider id embedded in a provider URL, or null when unparseable. */
export function providerIdFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // A trailing slash means the URL has no id segment (…/album/, …/album/1/).
  if (parsed.pathname.endsWith('/')) return null;
  const segments = parsed.pathname.split('/').filter(s => s.length > 0);
  const last = segments[segments.length - 1];
  return last && last.length > 0 ? last : null;
}

function normalizeUpc(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function summarizeRelease(
  release: DuplicateReportRelease
): DuplicateReportReleaseSummary {
  return {
    id: release.id,
    slug: release.slug,
    title: release.title,
    releaseDate: release.releaseDate,
    upc: normalizeUpc(release.upc),
    deletedAt: release.deletedAt,
    lifecycle: release.deletedAt ? 'deleted' : 'active',
    providerIds: release.providers.map(provider => ({
      key: provider.key,
      id: providerIdFromUrl(provider.url),
      url: provider.url,
    })),
    trackCount: release.tracks?.length ?? 0,
    trackIsrcs: (release.tracks ?? [])
      .map(track => track.isrc)
      .filter(
        (isrc): isrc is string => typeof isrc === 'string' && isrc.length > 0
      ),
    dependents: { ...(release.dependents ?? {}) },
  };
}

function collectEvidence(
  summaries: DuplicateReportReleaseSummary[]
): DuplicateReportEvidence[] {
  const fields: DuplicateReportEvidence['field'][] = [
    'title',
    'releaseDate',
    'upc',
    'slug',
    'lifecycle',
  ];
  const evidence: DuplicateReportEvidence[] = [];
  for (const field of fields) {
    const values = new Set<string>();
    for (const summary of summaries) {
      const value = summary[field];
      if (value !== null) values.add(value);
    }
    if (values.size > 1) {
      evidence.push({ field, values: [...values].sort() });
    }
  }
  return evidence;
}

function sumDependents(
  summaries: DuplicateReportReleaseSummary[]
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const summary of summaries) {
    for (const [resource, count] of Object.entries(summary.dependents)) {
      totals[resource] = (totals[resource] ?? 0) + count;
    }
  }
  return totals;
}

function pushSummary(
  bucket: DuplicateReportReleaseSummary[],
  summary: DuplicateReportReleaseSummary
): void {
  // A malformed export can repeat one release row (e.g. two identical
  // provider links); a bucket must contain distinct releases only, or it
  // would report a release colliding with itself.
  if (bucket.some(existing => existing.id === summary.id)) return;
  bucket.push(summary);
}

function buildGroup(
  kind: DuplicateCandidateKind,
  key: string,
  profileId: string,
  summaries: DuplicateReportReleaseSummary[]
): DuplicateCandidateGroup {
  return {
    kind,
    key,
    profileId,
    releases: summaries,
    conflictingEvidence: collectEvidence(summaries),
    dependentInventory: {
      totalTracks: summaries.reduce((sum, s) => sum + s.trackCount, 0),
      totalProviderLinks: summaries.reduce(
        (sum, s) => sum + s.providerIds.length,
        0
      ),
      byResource: sumDependents(summaries),
    },
    disposition: 'candidate',
  };
}

const KIND_ORDER: Record<DuplicateCandidateKind, number> = {
  'provider-album-id': 0,
  upc: 1,
};

function collisionKeysForRelease(
  release: DuplicateReportRelease,
  summary: DuplicateReportReleaseSummary
): Array<{ kind: DuplicateCandidateKind; key: string }> {
  const keys: Array<{ kind: DuplicateCandidateKind; key: string }> = [];
  for (const provider of summary.providerIds) {
    if (provider.id) {
      keys.push({
        kind: 'provider-album-id',
        key: `${provider.key}:${provider.id}`,
      });
    }
  }
  const upc = normalizeUpc(release.upc);
  if (upc) keys.push({ kind: 'upc', key: upc });
  return keys;
}

/**
 * Build the deterministic duplicate-candidate report for one authorized
 * export. Groups are exact-identifier collisions scoped to a single profile,
 * sorted by kind, then key, then profile id — the same input always produces
 * the same output.
 */
export function buildDuplicateReport(
  input: DuplicateReportInput
): DuplicateReport {
  const releases = input.releases;
  const profileIds = new Set(releases.map(release => release.profileId));

  type Bucket = DuplicateReportReleaseSummary[];
  const bucketsByProfile = new Map<string, Map<string, Bucket>>();

  for (const release of releases) {
    const summary = summarizeRelease(release);
    let buckets = bucketsByProfile.get(release.profileId);
    if (!buckets) {
      buckets = new Map();
      bucketsByProfile.set(release.profileId, buckets);
    }
    for (const { kind, key } of collisionKeysForRelease(release, summary)) {
      const bucketKey = `${kind}\u0000${key}`;
      const existing = buckets.get(bucketKey);
      if (existing) {
        pushSummary(existing, summary);
      } else {
        buckets.set(bucketKey, [summary]);
      }
    }
  }

  const groups: DuplicateCandidateGroup[] = [];
  for (const [profileId, buckets] of bucketsByProfile) {
    for (const [bucketKey, summaries] of buckets) {
      if (summaries.length < 2) continue;
      const [kind, key] = bucketKey.split('\u0000');
      groups.push(
        buildGroup(
          kind as DuplicateCandidateKind,
          key,
          profileId,
          [...summaries].sort((a, b) => a.id.localeCompare(b.id))
        )
      );
    }
  }

  groups.sort((a, b) => {
    const kindDelta = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (kindDelta !== 0) return kindDelta;
    const keyDelta = a.key.localeCompare(b.key);
    if (keyDelta !== 0) return keyDelta;
    return a.profileId.localeCompare(b.profileId);
  });

  const groupsByKind: Record<DuplicateCandidateKind, number> = {
    'provider-album-id': 0,
    upc: 0,
  };
  for (const group of groups) groupsByKind[group.kind] += 1;

  return {
    releaseCount: releases.length,
    profileCount: profileIds.size,
    groups,
    groupsByKind,
  };
}

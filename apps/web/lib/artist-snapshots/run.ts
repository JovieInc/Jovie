import type { ArtistDailySnapshotProvenance } from '@/lib/db/schema/artist-daily-snapshots';
import {
  ARTIST_SNAPSHOT_PACE_MS,
  ARTIST_SNAPSHOT_REMEDIATION_FINGERPRINT,
  assertPublicSnapshotPayload,
  isArtistDailySnapshotsEnabled,
  isSnapshotPrecision,
  resolveArtistSnapshotCap,
  utcSnapshotDay,
} from './contract';
export type ArtistSnapshotSourceName = 'youtube' | 'instagram' | 'wikipedia';

export interface ArtistSnapshotCandidate {
  readonly creatorProfileId: string;
  readonly youtubeUrl: string | null;
  readonly instagramUrl: string | null;
  readonly musicbrainzId: string | null;
  readonly existingSources: readonly ArtistSnapshotSourceName[];
}

export interface StoredArtistSnapshot {
  readonly creatorProfileId: string;
  readonly source: ArtistSnapshotSourceName;
  readonly snapshotDay: string;
  readonly fetchedAt: Date;
  readonly rawValues: Record<string, unknown>;
  readonly provenance: ArtistDailySnapshotProvenance;
}

export interface ArtistSnapshotStore {
  listCandidates(
    limit: number,
    day: string
  ): Promise<readonly ArtistSnapshotCandidate[]>;
  insert(row: StoredArtistSnapshot): Promise<'inserted' | 'duplicate'>;
}

export type SourceFetchResult =
  | {
      readonly kind: 'ready';
      readonly rawValues: Record<string, unknown>;
      readonly provenance: ArtistDailySnapshotProvenance;
    }
  | { readonly kind: 'skip'; readonly reason: string }
  | {
      readonly kind: 'failure';
      readonly reason: string;
      readonly httpStatus?: number;
      readonly backoff: boolean;
    };

export interface SnapshotFetchers {
  youtube(candidate: ArtistSnapshotCandidate): Promise<SourceFetchResult>;
  instagram(candidate: ArtistSnapshotCandidate): Promise<SourceFetchResult>;
  wikipedia(candidate: ArtistSnapshotCandidate): Promise<SourceFetchResult>;
}

export interface ArtistSnapshotFailure {
  readonly creatorProfileId: string;
  readonly source: ArtistSnapshotSourceName;
  readonly reason: string;
  readonly httpStatus: number | null;
}

export interface ArtistSnapshotRunReport {
  readonly enabled: boolean;
  readonly snapshotDay: string;
  readonly cap: number;
  readonly considered: number;
  readonly inserted: number;
  readonly skipped: number;
  readonly failures: readonly ArtistSnapshotFailure[];
}

const SOURCES: readonly ArtistSnapshotSourceName[] = [
  'youtube',
  'instagram',
  'wikipedia',
];

function hasIdentity(
  candidate: ArtistSnapshotCandidate,
  source: ArtistSnapshotSourceName
): boolean {
  if (source === 'youtube') return Boolean(candidate.youtubeUrl);
  if (source === 'instagram') return Boolean(candidate.instagramUrl);
  return Boolean(candidate.musicbrainzId);
}

function createPacer(sleep: (ms: number) => Promise<void>, now: () => number) {
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  return async function pace(): Promise<void> {
    const wait = Math.max(0, lastStartedAt + ARTIST_SNAPSHOT_PACE_MS - now());
    if (wait > 0) await sleep(wait);
    lastStartedAt = now();
  };
}

export async function runArtistDailySnapshots(input: {
  readonly now?: Date;
  readonly enabled?: boolean;
  readonly cap?: number;
  readonly store: ArtistSnapshotStore;
  readonly fetchers: SnapshotFetchers;
  readonly captureFailure?: (failure: {
    readonly fingerprint: typeof ARTIST_SNAPSHOT_REMEDIATION_FINGERPRINT;
    readonly failures: readonly ArtistSnapshotFailure[];
  }) => Promise<void>;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly clock?: () => number;
}): Promise<ArtistSnapshotRunReport> {
  const now = input.now ?? new Date();
  const enabled = input.enabled ?? isArtistDailySnapshotsEnabled();
  const cap = input.cap ?? resolveArtistSnapshotCap();
  const snapshotDay = utcSnapshotDay(now);
  if (!enabled) {
    return {
      enabled: false,
      snapshotDay,
      cap,
      considered: 0,
      inserted: 0,
      skipped: 0,
      failures: [],
    };
  }
  const candidates = await input.store.listCandidates(cap, snapshotDay);
  const pace = createPacer(
    input.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))),
    input.clock ?? Date.now
  );
  const backedOff = new Set<ArtistSnapshotSourceName>();
  const failures: ArtistSnapshotFailure[] = [];
  let inserted = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    for (const source of SOURCES) {
      if (
        !hasIdentity(candidate, source) ||
        candidate.existingSources.includes(source)
      ) {
        skipped += 1;
        continue;
      }
      if (backedOff.has(source)) {
        skipped += 1;
        continue;
      }
      await pace();
      let result: SourceFetchResult;
      try {
        result = await input.fetchers[source](candidate);
      } catch (error) {
        const reason = error instanceof Error ? error.name : 'fetch_threw';
        result = { kind: 'failure', reason, backoff: true };
      }
      if (result.kind === 'skip') {
        skipped += 1;
        continue;
      }
      if (result.kind === 'failure') {
        if (result.backoff) backedOff.add(source);
        failures.push({
          creatorProfileId: candidate.creatorProfileId,
          source,
          reason: result.reason,
          httpStatus: result.httpStatus ?? null,
        });
        continue;
      }
      try {
        assertPublicSnapshotPayload(result.rawValues);
        assertPublicSnapshotPayload({ ...result.provenance });
        if (result.provenance.access !== 'logged_out') {
          throw new Error('logged_in_payload');
        }
        if (!isSnapshotPrecision(result.rawValues.precision)) {
          throw new Error('missing_precision');
        }
      } catch (error) {
        failures.push({
          creatorProfileId: candidate.creatorProfileId,
          source,
          reason: error instanceof Error ? error.message : 'payload_rejected',
          httpStatus: null,
        });
        continue;
      }
      const write = await input.store.insert({
        creatorProfileId: candidate.creatorProfileId,
        source,
        snapshotDay,
        fetchedAt: now,
        rawValues: result.rawValues,
        provenance: result.provenance,
      });
      if (write === 'inserted') inserted += 1;
      else skipped += 1;
    }
  }
  if (failures.length > 0) {
    await input.captureFailure?.({
      fingerprint: ARTIST_SNAPSHOT_REMEDIATION_FINGERPRINT,
      failures,
    });
  }
  return {
    enabled: true,
    snapshotDay,
    cap,
    considered: candidates.length,
    inserted,
    skipped,
    failures,
  };
}

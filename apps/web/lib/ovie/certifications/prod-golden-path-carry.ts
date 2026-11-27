import type {
  ProdGoldenPathLedger,
  ProdGoldenPathReceipt,
  ProdGoldenPathSurfaceRecord,
} from './prod-golden-path-ledger';

/**
 * Release-bound Golden Path certification (JOV-14402). A certification
 * belongs to the release SHA it passed on and never ages out. A later release
 * that touches none of a step's files, routes or deps carries it forward with
 * a carried receipt (`carriedFrom` names the run that exercised the step). A
 * failure observed after a pass clears it: that is new evidence, not decay.
 */

/** One production run that passed a step. */
export interface ProdGoldenPathPassRef {
  readonly sha: string;
  readonly endedAt: string;
  readonly runUrl: string | null;
}

/** The newest pass a step holds; carried passes name their source. */
export interface ProdGoldenPathLastPassed extends ProdGoldenPathPassRef {
  readonly carriedFrom?: ProdGoldenPathPassRef | null;
}

const SHA_RE = /^[0-9a-f]{40}$/u;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * A receipt that ends after it was recorded (beyond clock skew) is bogus. The
 * ledger refuses it: it would otherwise pose as the newest release.
 */
export function isFutureDated(endedAt: string, recordedAt: string): boolean {
  return Date.parse(endedAt) > Date.parse(recordedAt) + CLOCK_SKEW_MS;
}

export function isProdGoldenPathPassRef(
  value: unknown
): value is ProdGoldenPathPassRef {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as Record<string, unknown>;
  return (
    typeof ref.sha === 'string' &&
    SHA_RE.test(ref.sha) &&
    typeof ref.endedAt === 'string' &&
    !Number.isNaN(Date.parse(ref.endedAt)) &&
    (ref.runUrl === null || typeof ref.runUrl === 'string')
  );
}

export function isProdGoldenPathLastPassed(
  value: unknown
): value is ProdGoldenPathLastPassed {
  if (!isProdGoldenPathPassRef(value)) return false;
  const from = (value as { carriedFrom?: unknown }).carriedFrom;
  return from === undefined || from === null || isProdGoldenPathPassRef(from);
}

/**
 * The pass a surface record holds. Records written before `lastPassed`
 * existed fall back to their latest receipt when it passed; a bare legacy
 * `lastPassedSha` has no run behind it, so it carries nothing.
 */
function effectiveLastPassed(
  record: ProdGoldenPathSurfaceRecord | undefined
): ProdGoldenPathLastPassed | null {
  if (!record) return null;
  if (record.lastPassed !== undefined) return record.lastPassed;
  const latest = record.latest;
  if (latest.status !== 'passed') return null;
  return {
    sha: latest.sha,
    endedAt: latest.endedAt,
    runUrl: latest.runUrl,
    carriedFrom: latest.carriedFrom ?? null,
  };
}

/**
 * The pass a surface holds after recording `receipt`: a pass replaces it, a
 * failure clears it (rule 4: new evidence), and a blocked receipt, which
 * exercised nothing, leaves it as it was.
 */
export function nextLastPassed(
  existing: ProdGoldenPathSurfaceRecord | undefined,
  receipt: ProdGoldenPathReceipt
): ProdGoldenPathLastPassed | null {
  if (receipt.status === 'passed') {
    return {
      sha: receipt.sha,
      endedAt: receipt.endedAt,
      runUrl: receipt.runUrl,
      carriedFrom: receipt.carriedFrom ?? null,
    };
  }
  if (receipt.status === 'failed') return null;
  return effectiveLastPassed(existing);
}

/**
 * The release the ledger speaks for: the SHA of its newest receipt. Every
 * run posts one receipt per surface for the build production serves, so this
 * is the served build as of the last certification run. Null when empty.
 */
export function ledgerServedSha(
  ledger: ProdGoldenPathLedger | null
): string | null {
  let newest: ProdGoldenPathReceipt | null = null;
  for (const record of Object.values(ledger?.surfaces ?? {})) {
    const endedAt = Date.parse(record.latest.endedAt);
    if (!Number.isFinite(endedAt)) continue;
    if (!newest || endedAt > Date.parse(newest.endedAt)) newest = record.latest;
  }
  return newest?.sha ?? null;
}

/** Certified means the surface's pass belongs to the served release. */
export function isSurfaceCertifiedOn(
  record: ProdGoldenPathSurfaceRecord | undefined,
  servedSha: string | null
): boolean {
  return servedSha !== null && effectiveLastPassed(record)?.sha === servedSha;
}

export interface ProdGoldenPathSurfaceCertification {
  /** The release this surface's pass belongs to, or null with no pass. */
  readonly certifiedSha: string | null;
  readonly certified: boolean;
  readonly lastPassed: ProdGoldenPathLastPassed | null;
}

/** Per-surface certifications for the ledger GET (carry decisions read it). */
export function surfaceCertifications(
  ledger: ProdGoldenPathLedger | null,
  surfaceIds: readonly string[]
): {
  readonly servedSha: string | null;
  readonly surfaces: Record<string, ProdGoldenPathSurfaceCertification>;
} {
  const servedSha = ledgerServedSha(ledger);
  const surfaces: Record<string, ProdGoldenPathSurfaceCertification> = {};
  for (const id of surfaceIds) {
    const record = ledger?.surfaces[id];
    const lastPassed = effectiveLastPassed(record);
    surfaces[id] = {
      certifiedSha: lastPassed?.sha ?? null,
      certified: isSurfaceCertifiedOn(record, servedSha),
      lastPassed,
    };
  }
  return { servedSha, surfaces };
}

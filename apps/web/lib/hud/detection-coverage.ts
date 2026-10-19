import registryJson from '@/data/detection-coverage-registry.json';
export type DetectionCoverageTrend = 'down' | 'flat' | 'up' | 'unknown';

interface DetectionCapability {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly knownBlindSpots: readonly string[];
  readonly nextExpansion: string;
  readonly proof: {
    readonly deliberateRedFixtures: readonly string[];
    readonly controlCases: readonly string[];
    readonly lastVerifiedLiveFiring: {
      readonly evidenceRef: string;
      readonly kind: string;
      readonly verifiedAt: string;
    } | null;
  };
  readonly priority: {
    readonly score: number;
  };
}
interface DetectionMetricWindow {
  readonly asOf: string;
  readonly founderRescueRate: number;
  readonly medianDetectionMinutes: number | null;
}
export interface DetectionFounderRescue {
  readonly id: string;
  readonly occurredAt: string;
  readonly source: string;
  readonly summary: string;
}
export interface DetectionBlindSpot {
  readonly capability: string;
  readonly summary: string;
}
export interface DetectionCoverageSnapshot {
  readonly covered: number;
  readonly total: number;
  readonly blindSpots: readonly DetectionBlindSpot[];
  readonly recentFounderRescues: readonly DetectionFounderRescue[];
  readonly founderRescueRate: number | null;
  readonly founderRescueRatePrevious: number | null;
  readonly founderRescueTrend: DetectionCoverageTrend;
  readonly medianDetectionMinutes: number | null;
  readonly medianDetectionMinutesPrevious: number | null;
  readonly medianDetectionTrend: DetectionCoverageTrend;
  readonly nextCapability: {
    readonly id: string;
    readonly title: string;
    readonly score: number;
    readonly nextExpansion: string;
  } | null;
}
interface DetectionCoverageRegistry {
  readonly schema: string;
  readonly capabilities: readonly DetectionCapability[];
  readonly metricWindows: readonly DetectionMetricWindow[];
  readonly recentFounderRescues: readonly DetectionFounderRescue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function asRegistry(value: unknown): DetectionCoverageRegistry {
  if (!isRecord(value))
    throw new Error('Detection coverage registry is invalid');
  if (value.schema !== 'jovie.detection-coverage-registry/v1') {
    throw new Error('Detection coverage registry schema is invalid');
  }
  if (
    !Array.isArray(value.capabilities) ||
    !Array.isArray(value.metricWindows) ||
    !Array.isArray(value.recentFounderRescues)
  ) {
    throw new Error('Detection coverage registry arrays are missing');
  }
  return value as unknown as DetectionCoverageRegistry;
}
function trend(
  current: number | null,
  previous: number | null
): DetectionCoverageTrend {
  if (current === null || previous === null) return 'unknown';
  if (current < previous) return 'down';
  if (current > previous) return 'up';
  return 'flat';
}
function isLiveVerified(capability: DetectionCapability): boolean {
  const proof = capability.proof;
  if (capability.status !== 'live-verified') return false;
  if (
    proof.deliberateRedFixtures.length === 0 ||
    proof.controlCases.length === 0 ||
    !proof.lastVerifiedLiveFiring?.evidenceRef
  ) {
    throw new Error(
      `${capability.id} cannot be learned without red, control, and live proof`
    );
  }
  return true;
}

export function compileDetectionCoverageRegistry(
  value: unknown
): DetectionCoverageSnapshot {
  const registry = asRegistry(value);
  const ids = registry.capabilities.map(item => item.id);
  if (ids.join('\n') !== [...ids].sort().join('\n')) {
    throw new Error('Detection coverage capabilities must be sorted by id');
  }
  const verified = registry.capabilities.filter(isLiveVerified);
  const unlearned = registry.capabilities
    .filter(item => !isLiveVerified(item))
    .sort(
      (a, b) => b.priority.score - a.priority.score || a.id.localeCompare(b.id)
    );
  const windows = [...registry.metricWindows].sort((a, b) =>
    a.asOf.localeCompare(b.asOf)
  );
  const current = windows.at(-1) ?? null;
  const previous = windows.at(-2) ?? null;
  const next = unlearned[0] ?? null;
  return {
    covered: verified.length,
    total: registry.capabilities.length,
    blindSpots: registry.capabilities
      .flatMap(capability =>
        capability.knownBlindSpots.map(summary => ({
          capability: capability.title,
          summary,
        }))
      )
      .slice(0, 3),
    recentFounderRescues: [...registry.recentFounderRescues]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 3),
    founderRescueRate: current?.founderRescueRate ?? null,
    founderRescueRatePrevious: previous?.founderRescueRate ?? null,
    founderRescueTrend: trend(
      current?.founderRescueRate ?? null,
      previous?.founderRescueRate ?? null
    ),
    medianDetectionMinutes: current?.medianDetectionMinutes ?? null,
    medianDetectionMinutesPrevious: previous?.medianDetectionMinutes ?? null,
    medianDetectionTrend: trend(
      current?.medianDetectionMinutes ?? null,
      previous?.medianDetectionMinutes ?? null
    ),
    nextCapability: next
      ? {
          id: next.id,
          title: next.title,
          score: next.priority.score,
          nextExpansion: next.nextExpansion,
        }
      : null,
  };
}

export function getDetectionCoverageSnapshot(): DetectionCoverageSnapshot {
  return compileDetectionCoverageRegistry(registryJson);
}

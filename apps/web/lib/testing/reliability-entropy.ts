import type { NightlyAgentStatus } from './nightly-agent-report';
import type { ParsedQuarantineLedger } from './quarantine-ledger';
import { RELIABILITY_DETECTORS } from './reliability-detectors';

export type EntropyOutcome = 'clear' | 'attention' | 'unknown';

/** An existing detector's result, not another probe or detector. */
export interface ReliabilityDetectorEvent {
  detectorId: string;
  observedAt: string;
  sourceRef: string;
  outcome: EntropyOutcome;
  findingCount: number;
}

const MAX_RESULT_AGE_MS = 30 * 60 * 60 * 1000;
const OUTCOMES: readonly EntropyOutcome[] = ['clear', 'attention', 'unknown'];

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Stateless fold on result arrival. Replays and input order cannot change it. */
export function projectReliabilityEntropy(
  events: readonly ReliabilityDetectorEvent[],
  asOf: string,
  maxAgeMs = MAX_RESULT_AGE_MS
) {
  const now = Date.parse(asOf);
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    throw new Error(
      'Entropy projection requires a valid time and freshness window'
    );
  }
  const ids = new Set(RELIABILITY_DETECTORS.map(detector => detector.id));
  const detectors = RELIABILITY_DETECTORS.map(detector => {
    const inputs = events.filter(event => event.detectorId === detector.id);
    const base = {
      detectorId: detector.id,
      sourceIssue: detector.sourceIssue,
      kind: detector.kind,
    };
    const unknown = (
      reason: string,
      latest: readonly ReliabilityDetectorEvent[] = []
    ) => ({
      ...base,
      outcome: 'unknown' as EntropyOutcome,
      reason,
      observedAt: latest[0]?.observedAt ?? null,
      sourceRefs: [...new Set(latest.map(event => event.sourceRef))].sort(),
      findingCount: null as number | null,
    });
    if (inputs.length === 0) return unknown('missing-result');
    if (
      inputs.some(
        event =>
          !Number.isFinite(Date.parse(event.observedAt)) ||
          Date.parse(event.observedAt) > now ||
          !event.sourceRef.trim() ||
          !OUTCOMES.includes(event.outcome) ||
          !validCount(event.findingCount) ||
          (event.outcome === 'clear' && event.findingCount !== 0)
      )
    )
      return unknown('invalid-result');
    const newest = Math.max(
      ...inputs.map(event => Date.parse(event.observedAt))
    );
    const latest = inputs.filter(
      event => Date.parse(event.observedAt) === newest
    );
    // Normalize equivalent timestamp spellings as well as event ordering.
    const normalized = latest.map(event => ({
      ...event,
      observedAt: new Date(newest).toISOString(),
    }));
    if (now - newest > maxAgeMs) return unknown('stale-result', normalized);
    if (
      new Set(latest.map(event => `${event.outcome}:${event.findingCount}`))
        .size > 1
    ) {
      return unknown('conflicting-results', normalized);
    }
    const result = latest[0];
    return {
      ...base,
      outcome: result.outcome,
      reason:
        result.outcome === 'unknown' ? 'unverified-result' : 'detector-result',
      observedAt: new Date(newest).toISOString(),
      sourceRefs: [...new Set(latest.map(event => event.sourceRef))].sort(),
      findingCount: result.outcome === 'unknown' ? null : result.findingCount,
    };
  });
  return {
    schema: 'jovie-reliability-entropy/v1' as const,
    asOf: new Date(now).toISOString(),
    trigger: 'existing-detector-results' as const,
    rejectedResultCount: events.filter(event => !ids.has(event.detectorId))
      .length,
    summary: Object.fromEntries(
      OUTCOMES.map(outcome => [
        outcome,
        detectors.filter(detector => detector.outcome === outcome).length,
      ])
    ),
    detectors,
  };
}

/** Reuse the existing nightly report and ledger evaluation without rerunning tests. */
export function nightlyReliabilityEvents(
  status: NightlyAgentStatus,
  quarantine: ParsedQuarantineLedger | null,
  quarantineObservedAt = status.generatedAt
): ReliabilityDetectorEvent[] {
  const counts = status.suites.flatMap(suite => [
    suite.total,
    suite.passed,
    suite.failed,
    suite.flaky,
    suite.skipped,
  ]);
  const findingCount = Math.max(
    status.failureCount,
    status.suites.reduce((sum, suite) => sum + suite.failed + suite.flaky, 0)
  );
  const executed = status.suites.reduce(
    (sum, suite) => sum + suite.passed + suite.failed,
    0
  );
  let outcome: EntropyOutcome = 'unknown';
  if (validCount(status.failureCount) && counts.every(validCount)) {
    if (findingCount > 0 || status.workflowConclusion === 'failure')
      outcome = 'attention';
    else if (
      executed > 0 &&
      status.pass &&
      status.workflowConclusion === 'success'
    )
      outcome = 'clear';
  }
  const events: ReliabilityDetectorEvent[] = [
    {
      detectorId: 'nightly-testing-agent',
      observedAt: status.generatedAt,
      sourceRef: status.workflowRunUrl ?? status.reportDocPath,
      outcome,
      findingCount: validCount(findingCount) ? findingCount : 0,
    },
  ];
  if (quarantine) {
    const attention =
      quarantine.issues.length > 0 ||
      quarantine.summary.activeCount > 0 ||
      quarantine.summary.expiredCount > 0 ||
      !quarantine.summary.withinRetryBudget;
    events.push({
      detectorId: 'flaky-quarantine-ledger',
      observedAt: quarantineObservedAt,
      sourceRef: 'apps/web/tests/quarantine.json',
      outcome: attention ? 'attention' : 'clear',
      findingCount: Math.max(
        quarantine.summary.activeCount,
        quarantine.summary.expiredCount,
        quarantine.issues.length,
        quarantine.summary.withinRetryBudget ? 0 : 1
      ),
    });
  }
  return events;
}

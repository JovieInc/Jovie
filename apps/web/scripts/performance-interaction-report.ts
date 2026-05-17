import {
  getInteractionHotPathById,
  type InteractionScenarioDefinition,
  type RootCauseBucket,
} from './performance-interaction-manifest';

export type InteractionCacheStatus = 'hit' | 'miss' | 'mixed' | 'unknown';

export interface InteractionLatencySample {
  readonly scenarioId: string;
  readonly runIndex: number;
  readonly firstFeedbackMs: number;
  readonly nextPaintMs?: number;
  readonly usableStateMs?: number;
  readonly dataReadyMs?: number;
  readonly reactCommitMs?: number;
  readonly longTaskCount?: number;
  readonly networkRequestCount?: number;
  readonly requestWaterfallCount?: number;
  readonly cacheStatus?: InteractionCacheStatus;
  readonly rootCauseBucket?: RootCauseBucket;
}

export interface InteractionRunMetadata {
  readonly authPersona?: string;
  readonly baseUrl?: string;
  readonly browser?: string;
  readonly buildMode?: 'development' | 'preview' | 'production' | 'test';
  readonly cpuProfile?: string;
  readonly datasetSize?: string;
  readonly networkProfile?: string;
  readonly sampleCount?: number;
  readonly viewport?: string;
}

export interface InteractionScenarioSummary {
  readonly scenario: InteractionScenarioDefinition;
  readonly samples: readonly InteractionLatencySample[];
  readonly sampleCount: number;
  readonly p50FirstFeedbackMs: number | null;
  readonly p75FirstFeedbackMs: number | null;
  readonly p95FirstFeedbackMs: number | null;
  readonly p95NextPaintMs: number | null;
  readonly p95UsableStateMs: number | null;
  readonly p95DataReadyMs: number | null;
  readonly worstFirstFeedbackMs: number | null;
  readonly targetP95Ms: number;
  readonly passed: boolean | null;
  readonly rootCauseBucket: RootCauseBucket;
  readonly cacheStatus: InteractionCacheStatus;
  readonly requestWaterfallCount: number;
  readonly userImpact: string;
  readonly expectedImpact: string;
  readonly effort: 'L' | 'M' | 'S' | 'XL' | 'XS';
  readonly confidence: 'High' | 'Low' | 'Med';
}

export interface InteractionLatencyReport {
  readonly generatedAt: string;
  readonly metadata: InteractionRunMetadata;
  readonly summaries: readonly InteractionScenarioSummary[];
  readonly status: 'fail' | 'pass' | 'pending';
}

function assertFiniteSampleValue(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`Expected non-negative finite ${label}`);
  }
}

export function percentile(values: readonly number[], p: number) {
  if (values.length === 0) {
    return null;
  }

  if (!Number.isFinite(p) || p < 0 || p > 100) {
    throw new TypeError('Expected percentile between 0 and 100');
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? null;
}

function compactNumbers(values: readonly Array<number | undefined>) {
  return values.filter((value): value is number => typeof value === 'number');
}

function mode<T extends string>(values: readonly T[], fallback: T): T {
  if (values.length === 0) {
    return fallback;
  }

  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return (
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    fallback
  );
}

function deriveUserImpact(scenario: InteractionScenarioDefinition) {
  if (scenario.managerLoopProximity === 'high') {
    return 'Core manager-loop workflow feels blocked';
  }

  if (scenario.expectedFrequency === 'high') {
    return 'Power-user keyboard flow feels heavy';
  }

  return 'Protected interaction loses perceived snappiness';
}

function deriveExpectedImpact(summary: {
  readonly passed: boolean | null;
  readonly scenario: InteractionScenarioDefinition;
}) {
  if (summary.passed === true) {
    return 'Protect with regression coverage';
  }

  if (summary.scenario.tier === 'P0') {
    return 'High perceived-speed improvement if fixed';
  }

  return 'Medium perceived-speed improvement if fixed';
}

function deriveEffort(
  scenario: InteractionScenarioDefinition
): 'L' | 'M' | 'S' | 'XL' | 'XS' {
  if (
    scenario.likelyRootCauseBuckets.includes('database-api-latency') ||
    scenario.likelyRootCauseBuckets.includes('request-waterfall')
  ) {
    return 'M';
  }

  if (scenario.likelyRootCauseBuckets.includes('bundle-hydration-cost')) {
    return 'L';
  }

  return 'S';
}

function summarizeScenario(
  scenario: InteractionScenarioDefinition,
  samples: readonly InteractionLatencySample[]
): InteractionScenarioSummary {
  for (const sample of samples) {
    assertFiniteSampleValue(sample.firstFeedbackMs, 'firstFeedbackMs');
    if (sample.usableStateMs !== undefined) {
      assertFiniteSampleValue(sample.usableStateMs, 'usableStateMs');
    }
    if (sample.dataReadyMs !== undefined) {
      assertFiniteSampleValue(sample.dataReadyMs, 'dataReadyMs');
    }
  }

  const firstFeedbackValues = samples.map(sample => sample.firstFeedbackMs);
  const nextPaintValues = compactNumbers(
    samples.map(sample => sample.nextPaintMs)
  );
  const usableStateValues = compactNumbers(
    samples.map(sample => sample.usableStateMs)
  );
  const dataReadyValues = compactNumbers(
    samples.map(sample => sample.dataReadyMs)
  );
  const p95FirstFeedbackMs = percentile(firstFeedbackValues, 95);
  const p95UsableStateMs = percentile(usableStateValues, 95);
  const p95DataReadyMs = percentile(dataReadyValues, 95);
  const targetP95Ms =
    scenario.budget.usableStateP95Ms ?? scenario.budget.firstFeedbackP95Ms;
  const measuredP95 = p95UsableStateMs ?? p95FirstFeedbackMs;
  const passed = measuredP95 === null ? null : measuredP95 <= targetP95Ms;
  const rootCauseBucket = mode(
    compactStrings(samples.map(sample => sample.rootCauseBucket)),
    'unknown'
  );
  const cacheStatus = mode(
    compactStrings(samples.map(sample => sample.cacheStatus)),
    'unknown'
  );

  const summary = {
    scenario,
    samples,
    sampleCount: samples.length,
    p50FirstFeedbackMs: percentile(firstFeedbackValues, 50),
    p75FirstFeedbackMs: percentile(firstFeedbackValues, 75),
    p95FirstFeedbackMs,
    p95NextPaintMs: percentile(nextPaintValues, 95),
    p95UsableStateMs,
    p95DataReadyMs,
    worstFirstFeedbackMs: percentile(firstFeedbackValues, 100),
    targetP95Ms,
    passed,
    rootCauseBucket,
    cacheStatus,
    requestWaterfallCount: Math.max(
      0,
      ...samples.map(sample => sample.requestWaterfallCount ?? 0)
    ),
    userImpact: deriveUserImpact(scenario),
    expectedImpact: '',
    effort: deriveEffort(scenario),
    confidence:
      samples.length >= 15 ? 'High' : samples.length >= 5 ? 'Med' : 'Low',
  } satisfies Omit<InteractionScenarioSummary, 'expectedImpact'> & {
    readonly expectedImpact: '';
  };

  return {
    ...summary,
    expectedImpact: deriveExpectedImpact(summary),
  };
}

function compactStrings<T extends string>(
  values: readonly Array<T | undefined>
) {
  return values.filter((value): value is T => typeof value === 'string');
}

function rankSummary(summary: InteractionScenarioSummary) {
  const tierWeight =
    summary.scenario.tier === 'P0' ? 3 : summary.scenario.tier === 'P1' ? 2 : 1;
  const proximityWeight =
    summary.scenario.managerLoopProximity === 'high'
      ? 3
      : summary.scenario.managerLoopProximity === 'medium'
        ? 2
        : 1;
  const trustWeight =
    summary.scenario.trustRisk === 'high'
      ? 3
      : summary.scenario.trustRisk === 'medium'
        ? 2
        : 1;
  const measured = summary.p95UsableStateMs ?? summary.p95FirstFeedbackMs ?? 0;
  const overshoot = Math.max(0, measured - summary.targetP95Ms);
  return (
    overshoot * 10 + tierWeight * 100 + proximityWeight * 50 + trustWeight * 25
  );
}

export function buildInteractionLatencyReport(options: {
  readonly generatedAt?: string;
  readonly metadata?: InteractionRunMetadata;
  readonly samples: readonly InteractionLatencySample[];
  readonly scenarios?: readonly InteractionScenarioDefinition[];
}): InteractionLatencyReport {
  const scenarios =
    options.scenarios ??
    [...new Set(options.samples.map(sample => sample.scenarioId))]
      .map(scenarioId => getInteractionHotPathById(scenarioId))
      .filter(
        (scenario): scenario is InteractionScenarioDefinition =>
          scenario !== undefined
      );

  const summaries = scenarios
    .map(scenario =>
      summarizeScenario(
        scenario,
        options.samples.filter(sample => sample.scenarioId === scenario.id)
      )
    )
    .sort((left, right) => rankSummary(right) - rankSummary(left));

  const measuredSummaries = summaries.filter(
    summary => summary.passed !== null
  );
  const hasFailure = measuredSummaries.some(
    summary => summary.passed === false
  );

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    metadata: options.metadata ?? {},
    summaries,
    status:
      measuredSummaries.length === 0 ? 'pending' : hasFailure ? 'fail' : 'pass',
  };
}

function formatMs(value: number | null) {
  return value === null ? 'n/a' : `${Math.round(value)}ms`;
}

function formatMetadata(metadata: InteractionRunMetadata) {
  const entries = Object.entries(metadata).filter(
    ([, value]) => value !== undefined && value !== ''
  );

  if (entries.length === 0) {
    return '_No run metadata supplied._';
  }

  return entries.map(([key, value]) => `- ${key}: ${String(value)}`).join('\n');
}

export function renderInteractionLatencyMarkdown(
  report: InteractionLatencyReport
) {
  const rows = report.summaries.map(
    (summary, index) =>
      `| ${[
        String(index + 1),
        summary.scenario.title,
        formatMs(summary.p95UsableStateMs ?? summary.p95FirstFeedbackMs),
        `${summary.targetP95Ms}ms`,
        summary.userImpact,
        summary.rootCauseBucket,
        summary.expectedImpact,
        summary.effort,
        summary.confidence,
      ].join(' | ')} |`
  );

  return [
    '# Hot Path Interaction Latency Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    '',
    '## Run Metadata',
    '',
    formatMetadata(report.metadata),
    '',
    '## Ranked Interactions',
    '',
    '| Rank | Hot path | Current p95 | Target p95 | User impact | Root cause | Fix | Effort | Confidence |',
    '| ---: | --- | ---: | ---: | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

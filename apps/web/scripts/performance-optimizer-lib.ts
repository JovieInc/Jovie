import { APP_ROUTES } from '../constants/routes';

export type PerfMode = 'homepage' | 'dashboard';
export type PerfPrimaryMetric = 'lighthouseScore' | 'warmShellResponseMs';

type GuardrailDirection = 'higher-better' | 'lower-better';

export interface PerfRunConfig {
  mode: PerfMode;
  threshold: number;
  baseUrl: string;
  authPath?: string;
  maxNoProgress: number;
  runsPerSample: number;
  artifactsDir: string;
}

export interface PerfLoopCliOptions {
  artifactsDir?: string;
  authPath?: string;
  baseUrl: string;
  fresh: boolean;
  hypothesis?: string;
  maxNoProgress: number;
  mode: PerfMode;
  runsPerSample: number;
  skipBuild: boolean;
  threshold: number;
}

export interface PerfIterationResult {
  iteration: number;
  hypothesis: string;
  filesChanged: string[];
  baseline: number;
  measured: number;
  accepted: boolean;
  reason: string;
}

export interface PerfHypothesis {
  id: string;
  bucket: string;
  summary: string;
  evidence: string[];
  targetFiles: string[];
}

export interface PerfGuardrail {
  key: string;
  label: string;
  value: number;
  unit: string;
  direction: GuardrailDirection;
  threshold: number;
}

export interface HomepageSample {
  lighthouseScore: number;
  accessibilityScore: number;
  seoScore: number;
  largestContentfulPaintMs: number;
  firstContentfulPaintMs: number;
  totalBlockingTimeMs: number;
  cumulativeLayoutShift: number;
  finalUrl: string;
}

export interface DashboardSample {
  warmShellResponseMs: number;
  timeToFirstByteMs: number;
  skeletonToContentMs: number;
  firstContentfulPaintMs: number;
  largestContentfulPaintMs: number;
  cumulativeLayoutShift: number;
  finalUrl: string;
}

export interface PerfMeasurement<TSample> {
  mode: PerfMode;
  primaryMetric: number;
  primaryMetricKey: PerfPrimaryMetric;
  primaryMetricLabel: string;
  primaryMetricUnit: 'points' | 'ms';
  threshold: number;
  samples: TSample[];
  medianSample: TSample;
  guardrails: PerfGuardrail[];
  raw: unknown;
  summary: string;
}

export interface PerfDecision {
  accepted: boolean;
  improvement: number;
  reason: string;
  regressions: string[];
  thresholdReached: boolean;
}

export interface PerfRunState {
  version: number;
  config: PerfRunConfig;
  artifactDir: string;
  promptPath: string;
  createdAt: string;
  updatedAt: string;
  status: 'baseline' | 'running' | 'threshold-hit' | 'stalled';
  baselineMeasurement?: PerfMeasurement<HomepageSample | DashboardSample>;
  bestMeasurement?: PerfMeasurement<HomepageSample | DashboardSample>;
  iterations: PerfIterationResult[];
  noProgressCount: number;
  nextHypothesisIndex: number;
}

interface LighthouseCategoryLike {
  score?: number | null;
}

interface LighthouseAuditLike {
  numericValue?: number | null;
}

interface LighthouseResultLike {
  finalDisplayedUrl?: string;
  categories?: Record<string, LighthouseCategoryLike | undefined>;
  audits?: Record<string, LighthouseAuditLike | undefined>;
}

interface BudgetGuardPageLike {
  url?: string;
  rawTimings?: Record<string, number>;
}

interface BudgetGuardSummaryLike {
  pages?: BudgetGuardPageLike[];
}

const HOMEPAGE_IMPROVEMENT_DELTA = 1;
const DASHBOARD_IMPROVEMENT_DELTA_MS = 25;
const REGRESSION_TOLERANCE_RATIO = 0.05;
const PERFORMANCE_BUDGET_GUARD_SCRIPT = 'scripts/performance-budgets-guard.ts';

const MIN_GUARDRAIL_TOLERANCE_BY_KEY: Record<string, number> = {
  'largest-contentful-paint': 100,
  'first-contentful-paint': 100,
  'total-blocking-time': 25,
  'time-to-first-byte': 50,
  'skeleton-to-content': 25,
  'warm-shell-response': 25,
  'cumulative-layout-shift': 0.02,
  'accessibility-score': 1,
  'seo-score': 1,
};

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentileMedianIndex(length: number) {
  return Math.floor(length / 2);
}

function sortAscending<T>(items: readonly T[], selector: (item: T) => number) {
  return [...items].sort((left, right) => selector(left) - selector(right));
}

function medianSampleBy<T>(
  items: readonly T[],
  selector: (item: T) => number
): T {
  if (items.length === 0) {
    throw new Error('Cannot compute a median sample from an empty set.');
  }

  return sortAscending(items, selector)[
    percentileMedianIndex(items.length)
  ] as T;
}

function coerceNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function scoreToPoints(value: number | null | undefined) {
  return round(coerceNumber(value) * 100, 2);
}

function getLighthouseAuditValue(
  audits: LighthouseResultLike['audits'],
  key: string
) {
  return coerceNumber(audits?.[key]?.numericValue);
}

function getSampleRegressionTolerance(guardrail: PerfGuardrail) {
  const minimumTolerance = MIN_GUARDRAIL_TOLERANCE_BY_KEY[guardrail.key] ?? 0;

  if (guardrail.value === 0) {
    return Math.max(
      guardrail.threshold * REGRESSION_TOLERANCE_RATIO,
      0.05,
      minimumTolerance
    );
  }

  return Math.max(
    Math.abs(guardrail.value) * REGRESSION_TOLERANCE_RATIO,
    minimumTolerance
  );
}

function buildHomepageGuardrails(sample: HomepageSample): PerfGuardrail[] {
  return [
    {
      key: 'largest-contentful-paint',
      label: 'LCP',
      value: sample.largestContentfulPaintMs,
      unit: 'ms',
      direction: 'lower-better',
      threshold: 2500,
    },
    {
      key: 'first-contentful-paint',
      label: 'FCP',
      value: sample.firstContentfulPaintMs,
      unit: 'ms',
      direction: 'lower-better',
      threshold: 1800,
    },
    {
      key: 'total-blocking-time',
      label: 'TBT',
      value: sample.totalBlockingTimeMs,
      unit: 'ms',
      direction: 'lower-better',
      threshold: 200,
    },
    {
      key: 'cumulative-layout-shift',
      label: 'CLS',
      value: sample.cumulativeLayoutShift,
      unit: '',
      direction: 'lower-better',
      threshold: 0.05,
    },
    {
      key: 'accessibility-score',
      label: 'Accessibility',
      value: sample.accessibilityScore,
      unit: 'points',
      direction: 'higher-better',
      threshold: 90,
    },
    {
      key: 'seo-score',
      label: 'SEO',
      value: sample.seoScore,
      unit: 'points',
      direction: 'higher-better',
      threshold: 90,
    },
  ];
}

function buildDashboardGuardrails(sample: DashboardSample): PerfGuardrail[] {
  return [
    {
      key: 'time-to-first-byte',
      label: 'TTFB',
      value: sample.timeToFirstByteMs,
      unit: 'ms',
      direction: 'lower-better',
      threshold: 500,
    },
    {
      key: 'skeleton-to-content',
      label: 'Skeleton To Content',
      value: sample.skeletonToContentMs,
      unit: 'ms',
      direction: 'lower-better',
      threshold: 300,
    },
    {
      key: 'first-contentful-paint',
      label: 'FCP',
      value: sample.firstContentfulPaintMs,
      unit: 'ms',
      direction: 'lower-better',
      threshold: 1500,
    },
    {
      key: 'largest-contentful-paint',
      label: 'LCP',
      value: sample.largestContentfulPaintMs,
      unit: 'ms',
      direction: 'lower-better',
      threshold: 2500,
    },
    {
      key: 'cumulative-layout-shift',
      label: 'CLS',
      value: sample.cumulativeLayoutShift,
      unit: '',
      direction: 'lower-better',
      threshold: 0.1,
    },
  ];
}

export function getDefaultThreshold(mode: PerfMode) {
  return mode === 'homepage' ? 95 : 100;
}

export function parsePerfLoopArgs(
  args: string[],
  baseUrl = process.env.BASE_URL || 'http://localhost:3000'
): PerfLoopCliOptions {
  const options: PerfLoopCliOptions = {
    baseUrl,
    fresh: false,
    maxNoProgress: 3,
    mode: 'homepage',
    runsPerSample: 3,
    skipBuild: false,
    threshold: getDefaultThreshold('homepage'),
  };
  let thresholdProvided = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--') {
      continue;
    }

    if (arg === '--mode') {
      const value = args[index + 1];
      if (value !== 'homepage' && value !== 'dashboard') {
        throw new TypeError('Expected --mode homepage|dashboard');
      }
      options.mode = value;
      if (!thresholdProvided) {
        options.threshold = getDefaultThreshold(value);
      }
      index += 1;
      continue;
    }

    if (arg === '--threshold') {
      const value = Number(args[index + 1]);
      if (!Number.isFinite(value)) {
        throw new TypeError('Expected a numeric value for --threshold');
      }
      options.threshold = value;
      thresholdProvided = true;
      index += 1;
      continue;
    }

    if (arg === '--base-url') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Expected a value for --base-url');
      }
      options.baseUrl = value;
      index += 1;
      continue;
    }

    if (arg === '--auth-path') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Expected a value for --auth-path');
      }
      options.authPath = value;
      index += 1;
      continue;
    }

    if (arg === '--artifacts-dir') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Expected a value for --artifacts-dir');
      }
      options.artifactsDir = value;
      index += 1;
      continue;
    }

    if (arg === '--runs-per-sample') {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new TypeError(
          'Expected a positive integer for --runs-per-sample'
        );
      }
      options.runsPerSample = value;
      index += 1;
      continue;
    }

    if (arg === '--max-no-progress') {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new TypeError(
          'Expected a positive integer for --max-no-progress'
        );
      }
      options.maxNoProgress = value;
      index += 1;
      continue;
    }

    if (arg === '--hypothesis') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Expected a value for --hypothesis');
      }
      options.hypothesis = value;
      index += 1;
      continue;
    }

    if (arg === '--fresh') {
      options.fresh = true;
      continue;
    }

    if (arg === '--skip-build') {
      options.skipBuild = true;
      continue;
    }

    if (arg === '--help') {
      continue;
    }

    throw new TypeError('Unknown argument: ' + arg);
  }

  return options;
}

export function createEmptyRunState(
  config: PerfRunConfig,
  promptPath: string
): PerfRunState {
  const now = new Date().toISOString();
  return {
    version: 1,
    config,
    artifactDir: config.artifactsDir,
    promptPath,
    createdAt: now,
    updatedAt: now,
    status: 'baseline',
    iterations: [],
    noProgressCount: 0,
    nextHypothesisIndex: 0,
  };
}

export function extractHomepageSample(
  lhr: LighthouseResultLike
): HomepageSample {
  return {
    lighthouseScore: scoreToPoints(lhr.categories?.performance?.score),
    accessibilityScore: scoreToPoints(lhr.categories?.accessibility?.score),
    seoScore: scoreToPoints(lhr.categories?.seo?.score),
    largestContentfulPaintMs: getLighthouseAuditValue(
      lhr.audits,
      'largest-contentful-paint'
    ),
    firstContentfulPaintMs: getLighthouseAuditValue(
      lhr.audits,
      'first-contentful-paint'
    ),
    totalBlockingTimeMs: getLighthouseAuditValue(
      lhr.audits,
      'total-blocking-time'
    ),
    cumulativeLayoutShift: round(
      getLighthouseAuditValue(lhr.audits, 'cumulative-layout-shift'),
      4
    ),
    finalUrl: lhr.finalDisplayedUrl ?? '/',
  };
}

export function createHomepageMeasurement(
  samples: HomepageSample[],
  threshold: number,
  raw: unknown
): PerfMeasurement<HomepageSample> {
  const medianSample = medianSampleBy(
    samples,
    sample => sample.lighthouseScore
  );
  return {
    mode: 'homepage',
    primaryMetric: medianSample.lighthouseScore,
    primaryMetricKey: 'lighthouseScore',
    primaryMetricLabel: 'Lighthouse Score',
    primaryMetricUnit: 'points',
    threshold,
    samples,
    medianSample,
    guardrails: buildHomepageGuardrails(medianSample),
    raw,
    summary:
      'Lighthouse ' +
      medianSample.lighthouseScore.toFixed(2) +
      ' | LCP ' +
      Math.round(medianSample.largestContentfulPaintMs) +
      'ms | TBT ' +
      Math.round(medianSample.totalBlockingTimeMs) +
      'ms',
  };
}

export function extractDashboardSample(
  summary: BudgetGuardSummaryLike
): DashboardSample {
  const page = summary.pages?.[0];
  if (!page?.rawTimings) {
    throw new Error(
      'Performance budget guard did not return raw timings. Run with --json on a compatible script version.'
    );
  }

  const warmShellResponseMs = coerceNumber(
    page.rawTimings['warm-shell-response']
  );
  if (warmShellResponseMs <= 0) {
    throw new Error(
      'Warm shell response timing is missing. The dashboard guard must expose rawTimings.warm-shell-response.'
    );
  }

  return {
    warmShellResponseMs,
    timeToFirstByteMs: coerceNumber(page.rawTimings['time-to-first-byte']),
    skeletonToContentMs: coerceNumber(page.rawTimings['skeleton-to-content']),
    firstContentfulPaintMs: coerceNumber(
      page.rawTimings['first-contentful-paint']
    ),
    largestContentfulPaintMs: coerceNumber(
      page.rawTimings['largest-contentful-paint']
    ),
    cumulativeLayoutShift: round(
      coerceNumber(page.rawTimings['cumulative-layout-shift']),
      4
    ),
    finalUrl: page.url ?? APP_ROUTES.DASHBOARD_RELEASES,
  };
}

export function createDashboardMeasurement(
  samples: DashboardSample[],
  threshold: number,
  raw: unknown
): PerfMeasurement<DashboardSample> {
  const medianSample = medianSampleBy(
    samples,
    sample => sample.warmShellResponseMs
  );
  return {
    mode: 'dashboard',
    primaryMetric: medianSample.warmShellResponseMs,
    primaryMetricKey: 'warmShellResponseMs',
    primaryMetricLabel: 'Warm Shell Response',
    primaryMetricUnit: 'ms',
    threshold,
    samples,
    medianSample,
    guardrails: buildDashboardGuardrails(medianSample),
    raw,
    summary:
      'Warm shell ' +
      Math.round(medianSample.warmShellResponseMs) +
      'ms | TTFB ' +
      Math.round(medianSample.timeToFirstByteMs) +
      'ms | Skeleton ' +
      Math.round(medianSample.skeletonToContentMs) +
      'ms',
  };
}

export function buildDashboardBudgetGuardArgs(resolvedAuthPath?: string) {
  const args = [
    'run',
    '--',
    'pnpm',
    '--filter',
    'web',
    'exec',
    'tsx',
    PERFORMANCE_BUDGET_GUARD_SCRIPT,
    '--json',
    '--path',
    APP_ROUTES.DASHBOARD_RELEASES,
  ];

  if (resolvedAuthPath) {
    args.push('--auth-path', resolvedAuthPath);
  }

  return args;
}

function isThresholdReached(
  measurement: PerfMeasurement<HomepageSample | DashboardSample>
) {
  if (measurement.mode === 'homepage') {
    return measurement.primaryMetric >= measurement.threshold;
  }

  return measurement.primaryMetric <= measurement.threshold;
}

export function evaluateMeasurement(
  baseline: PerfMeasurement<HomepageSample | DashboardSample>,
  candidate: PerfMeasurement<HomepageSample | DashboardSample>
): PerfDecision {
  const improvement =
    candidate.mode === 'homepage'
      ? round(candidate.primaryMetric - baseline.primaryMetric, 2)
      : round(baseline.primaryMetric - candidate.primaryMetric, 2);

  const requiredImprovement =
    candidate.mode === 'homepage'
      ? HOMEPAGE_IMPROVEMENT_DELTA
      : DASHBOARD_IMPROVEMENT_DELTA_MS;

  const regressions: string[] = [];
  for (const guardrail of candidate.guardrails) {
    const baselineGuardrail = baseline.guardrails.find(
      current => current.key === guardrail.key
    );
    if (!baselineGuardrail) {
      continue;
    }

    const tolerance = getSampleRegressionTolerance(baselineGuardrail);
    if (guardrail.direction === 'lower-better') {
      if (guardrail.value > baselineGuardrail.value + tolerance) {
        regressions.push(
          guardrail.label +
            ' regressed from ' +
            baselineGuardrail.value.toFixed(2) +
            guardrail.unit +
            ' to ' +
            guardrail.value.toFixed(2) +
            guardrail.unit
        );
      }
      continue;
    }

    if (guardrail.value < baselineGuardrail.value - tolerance) {
      regressions.push(
        guardrail.label +
          ' regressed from ' +
          baselineGuardrail.value.toFixed(2) +
          guardrail.unit +
          ' to ' +
          guardrail.value.toFixed(2) +
          guardrail.unit
      );
    }
  }

  if (regressions.length > 0) {
    return {
      accepted: false,
      improvement,
      reason: regressions.join('; '),
      regressions,
      thresholdReached: isThresholdReached(candidate),
    };
  }

  if (improvement < requiredImprovement) {
    return {
      accepted: false,
      improvement,
      reason:
        'Primary metric improved by ' +
        improvement.toFixed(2) +
        (candidate.mode === 'homepage' ? ' points' : 'ms') +
        ', below the required delta of ' +
        requiredImprovement +
        (candidate.mode === 'homepage' ? ' points.' : 'ms.'),
      regressions: [],
      thresholdReached: isThresholdReached(candidate),
    };
  }

  return {
    accepted: true,
    improvement,
    reason:
      'Primary metric improved by ' +
      improvement.toFixed(2) +
      (candidate.mode === 'homepage' ? ' points' : 'ms') +
      ' with no material guardrail regression.',
    regressions: [],
    thresholdReached: isThresholdReached(candidate),
  };
}

const HOMEPAGE_HYPOTHESES: PerfHypothesis[] = [
  {
    id: 'home-eager-sections',
    bucket: 'bundle splitting and lazy loading',
    summary:
      'Defer below-the-fold homepage sections that are imported eagerly by the marketing page.',
    evidence: [
      'apps/web/app/(marketing)/page.tsx imports AiDemo, AnalyticsSection, AudienceCRMSection, PricingSection, ReleasesSection, and TestimonialsSection eagerly.',
      'The homepage route is fully static, which makes client bundle weight a likely next limiter after TTFB is already low.',
    ],
    targetFiles: [
      'apps/web/app/(marketing)/page.tsx',
      'apps/web/components/features/home/AiDemo.tsx',
      'apps/web/components/features/home/AnalyticsSection.tsx',
      'apps/web/components/features/home/AudienceCRMSection.tsx',
    ],
  },
  {
    id: 'home-hero-asset-weight',
    bucket: 'image, font, and script weight cuts',
    summary:
      'Reduce the hero screenshot cost and verify the priority image is truly earning its bytes.',
    evidence: [
      'apps/web/components/features/home/HeroScrollSection.tsx renders a priority ProductScreenshot using /product-screenshots/releases-dashboard-sidebar.png.',
      'Large above-the-fold image bytes can dominate Lighthouse LCP even when server work is already static.',
    ],
    targetFiles: [
      'apps/web/components/features/home/HeroScrollSection.tsx',
      'apps/web/components/features/home/ProductScreenshot.tsx',
    ],
  },
  {
    id: 'home-client-animation-cost',
    bucket: 'render-path simplification',
    summary:
      'Trim or defer homepage demo animation work that starts observers, timers, and crypto on first view.',
    evidence: [
      'apps/web/components/features/home/AiDemo.tsx is a client component with IntersectionObserver, timers, and animated segment reveals.',
      'The demo is below the fold from a business perspective and can tolerate later hydration better than the hero CTA.',
    ],
    targetFiles: [
      'apps/web/components/features/home/AiDemo.tsx',
      'apps/web/app/(marketing)/page.tsx',
    ],
  },
  {
    id: 'home-provider-deferral',
    bucket: 'provider deferral',
    summary:
      'Audit route-agnostic client providers and move non-essential monitoring work further off the critical path.',
    evidence: [
      'apps/web/components/providers/CoreProviders.tsx initializes monitoring and lazy providers on every route.',
      'Marketing pages are static, so extra provider work is one of the few remaining moving parts on first paint.',
    ],
    targetFiles: [
      'apps/web/components/providers/CoreProviders.tsx',
      'apps/web/components/providers/LazyProviders.tsx',
    ],
  },
];

const DASHBOARD_HYPOTHESES: PerfHypothesis[] = [
  {
    id: 'dashboard-nav-release-badge',
    bucket: 'server/client boundary shifts',
    summary:
      'Remove or defer the sidebar release-count query so warm navigation is not gated by badge bookkeeping.',
    evidence: [
      'apps/web/components/features/dashboard/dashboard-nav/DashboardNav.tsx calls useReleasesQuery(profileId) before the user clicks into Releases.',
      'That work happens on the shared shell, so it can steal time from the instant-feel navigation budget.',
    ],
    targetFiles: [
      'apps/web/components/features/dashboard/dashboard-nav/DashboardNav.tsx',
      'apps/web/lib/queries/useReleasesQuery.ts',
    ],
  },
  {
    id: 'dashboard-release-matrix-shell',
    bucket: 'progressive rendering',
    summary:
      'Shrink the first interactive releases shell by pushing more matrix features behind interaction boundaries.',
    evidence: [
      'apps/web/components/features/dashboard/organisms/release-provider-matrix/ReleaseProviderMatrix.tsx is a large client component with multiple hooks, drawers, and table helpers.',
      'The page already has a Suspense fallback in apps/web/app/app/(shell)/dashboard/releases/page.tsx, so more shell/content separation is viable.',
    ],
    targetFiles: [
      'apps/web/components/features/dashboard/organisms/release-provider-matrix/ReleaseProviderMatrix.tsx',
      'apps/web/app/app/(shell)/dashboard/releases/page.tsx',
    ],
  },
  {
    id: 'dashboard-prefetch-route',
    bucket: 'caching, staticization, and query shaping',
    summary:
      'Prefetch the releases route and its first data dependencies from the dashboard shell before the click lands.',
    evidence: [
      'The dashboard shell already renders the Releases nav item, which is a natural place to prefetch a high-frequency route.',
      'The new warm-shell metric measures a real nav click via /app/releases, so route prefetching will show up immediately in the primary metric.',
    ],
    targetFiles: [
      'apps/web/components/features/dashboard/dashboard-nav/DashboardNav.tsx',
      'apps/web/app/app/(shell)/dashboard/releases/page.tsx',
    ],
  },
  {
    id: 'dashboard-skeleton-visibility',
    bucket: 'CSS, hydration, and render-path simplification',
    summary:
      'Make the releases loading shell appear with less work before the heavy matrix subtree hydrates.',
    evidence: [
      'apps/web/app/app/(shell)/dashboard/releases/loading.tsx already exposes data-testid=releases-loading and is a clean optimization boundary.',
      'The dashboard target is warm visible shell response, not total content completion, so shaving shell work matters directly.',
    ],
    targetFiles: [
      'apps/web/app/app/(shell)/dashboard/releases/loading.tsx',
      'apps/web/app/app/(shell)/dashboard/releases/ReleasesClientBoundary.tsx',
    ],
  },
];

export function getRankedHypotheses(mode: PerfMode): PerfHypothesis[] {
  return mode === 'homepage' ? HOMEPAGE_HYPOTHESES : DASHBOARD_HYPOTHESES;
}

export function buildOptimizerPrompt(options: {
  state: PerfRunState;
  nextHypothesis?: PerfHypothesis;
  changedFiles: string[];
}) {
  const { state, nextHypothesis, changedFiles } = options;
  const measurement = state.bestMeasurement;
  const lines = [
    'You are the performance optimizer for the Jovie monorepo.',
    'Your job is to recurse until the target metric crosses the threshold, keeping only winning changes and discarding losing ones immediately.',
    '',
    'Current run:',
    '- Mode: ' + state.config.mode,
    '- Threshold: ' + state.config.threshold,
    '- Artifact dir: ' + state.artifactDir,
    '- Current best: ' +
      (measurement ? measurement.summary : 'No baseline yet'),
    '- Changed files in workspace: ' +
      (changedFiles.length > 0 ? changedFiles.join(', ') : 'none'),
    '',
    'Repo rules:',
    '- Work from repo root.',
    '- Run ./scripts/setup.sh first.',
    '- Prefix secret-dependent commands with doppler run --.',
    '- Measure on a prod-like build, never on dev-mode timings.',
    '- Make one reversible optimization at a time.',
    '- After every change, rebuild and remeasure.',
    '- Keep a change only if the primary metric improves and hard guardrails do not regress materially.',
    '- Revert or discard losing experiments immediately.',
    '- Log every baseline, hypothesis, change, metric, accept/reject decision, and next step in the artifact directory.',
    '',
    'Primary metric:',
    state.config.mode === 'homepage'
      ? '- Lighthouse performance score for / with LCP <= 2500ms, FCP <= 1800ms, TBT <= 200ms, CLS <= 0.05, and no accessibility/SEO regression.'
      : '- Warm authenticated navigation-to-visible-shell time for /app/dashboard/releases with TTFB <= 500ms and skeleton-to-content <= 300ms.',
  ];

  if (nextHypothesis) {
    lines.push(
      '',
      'Next hypothesis:',
      '- Bucket: ' + nextHypothesis.bucket,
      '- Summary: ' + nextHypothesis.summary
    );
    for (const evidence of nextHypothesis.evidence) {
      lines.push('- Evidence: ' + evidence);
    }
    lines.push('- Target files: ' + nextHypothesis.targetFiles.join(', '));
  }

  lines.push(
    '',
    'Loop:',
    '1. Measure a 3-run baseline and use the median.',
    '2. Rank the next hypotheses using actual repo evidence, not generic advice.',
    '3. Try exactly one optimization.',
    '4. Rebuild and remeasure 3 times.',
    '5. Accept only if the median beats noise: >=1 Lighthouse point or >=25ms, with no guardrail regression >5%.',
    '6. If accepted, stack it and continue.',
    '7. If rejected, revert it, record why, and try a different optimization class.',
    '8. When the threshold is reached, print before/after evidence and ask: Threshold hit. Push lower?'
  );

  return lines.join('\n');
}

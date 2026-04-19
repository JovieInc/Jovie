import { APP_ROUTES } from '@/constants/routes';
import type { DevTestAuthPersona } from '@/lib/auth/dev-test-auth-types';

export type PerfIssueKind =
  | 'timing-budget'
  | 'resource-budget'
  | 'network-churn'
  | 'harness-broken'
  | 'measurement-integrity'
  | 'data-quality'
  | 'hydration-hotspot'
  | 'server-caching';

export type PerfProgramSurface =
  | 'homepage'
  | 'public-profile'
  | 'creator-app'
  | 'onboarding'
  | 'tooling';

export type PerfBatchCheckKind =
  | 'budget-route'
  | 'budget-group'
  | 'direct-metrics';

export type PerfCheckExpectation = 'pass' | 'summary';

export interface PerfDirectMetricsBudget {
  readonly cssKB?: number;
  readonly finalPath?: string;
  readonly fcpMs?: number;
  readonly lcpMs?: number;
  readonly networkIdle?: boolean;
  readonly networkIdleTimeoutMs?: number;
  readonly requests?: number;
  readonly scriptKB?: number;
  readonly totalKB?: number;
  readonly ttfbMs?: number;
}

export interface PerfBatchCheck {
  readonly id: string;
  readonly label: string;
  readonly kind: PerfBatchCheckKind;
  readonly expectation: PerfCheckExpectation;
  readonly authPersona?: DevTestAuthPersona;
  readonly directMetrics?: PerfDirectMetricsBudget;
  readonly groupIds?: readonly string[];
  readonly path?: string;
  readonly routeIds?: readonly string[];
}

export interface PerfIssue {
  readonly id: string;
  readonly title: string;
  readonly kind: PerfIssueKind;
  readonly surface: PerfProgramSurface;
  readonly evidence: readonly string[];
  readonly batchId: string;
  readonly checks: readonly string[];
}

export interface PerfBatch {
  readonly id: string;
  readonly title: string;
  readonly branchName: string;
  readonly issueIds: readonly string[];
  readonly localChecks: readonly PerfBatchCheck[];
  readonly qaScope: readonly string[];
  readonly shipLabels: readonly string[];
  readonly doneRule: string;
}

export type PerfBlockedKind =
  | 'flaky-harness'
  | 'product-regression'
  | 'cache-bug'
  | 'review-finding'
  | 'unknown';

export type PerfQueueBatchStatus =
  | 'queued'
  | 'ready'
  | 'fixing'
  | 'ready-for-qa'
  | 'in-qa'
  | 'in-review'
  | 'in-ship'
  | 'blocked'
  | 'merged';

export type PerfQueueStatus = 'idle' | 'running' | 'blocked' | 'complete';

export interface PerfQueueBatchState {
  readonly batchId: string;
  readonly status: PerfQueueBatchStatus;
  readonly branch: string | null;
  readonly prNumber: number | null;
  readonly attempt: number;
  readonly mergedAt: string | null;
  readonly blockedKind: PerfBlockedKind | null;
  readonly blockedReason: string | null;
  readonly lastTransitionAt: string;
}

export interface PerfQueueState {
  readonly version: number;
  readonly currentBatchId: string | null;
  readonly status: PerfQueueStatus;
  readonly lastTransitionAt: string;
  readonly completedIssueIds: readonly string[];
  readonly blockedReason: string | null;
  readonly batches: readonly PerfQueueBatchState[];
}

export const PERF_QUEUE_CHANGE_LIMITS = {
  maxDiffLines: 400,
  maxFiles: 10,
} as const;

const PERF_ISSUES = [
  {
    id: 'P01',
    title: 'Home interactive shell is over budget',
    kind: 'timing-budget',
    surface: 'homepage',
    evidence: [
      '`/` interactive-shell-ready measured 244ms against a 100ms budget.',
    ],
    batchId: 'B5-home',
    checks: ['home-budget-pass'],
  },
  {
    id: 'P02',
    title: 'Public profile FCP misses budget',
    kind: 'timing-budget',
    surface: 'public-profile',
    evidence: [
      '`/tim` first-contentful-paint measured 2008ms against an 800ms budget.',
    ],
    batchId: 'B1-public-profile',
    checks: ['public-profile-main-budget-pass'],
  },
  {
    id: 'P03',
    title: 'Public profile LCP misses budget',
    kind: 'timing-budget',
    surface: 'public-profile',
    evidence: [
      '`/tim` largest-contentful-paint measured 2320ms against a 1500ms budget.',
    ],
    batchId: 'B1-public-profile',
    checks: ['public-profile-main-budget-pass'],
  },
  {
    id: 'P04',
    title: 'Public profile interactive shell misses budget',
    kind: 'timing-budget',
    surface: 'public-profile',
    evidence: [
      '`/tim` interactive-shell-ready measured 2317ms against a 100ms budget.',
    ],
    batchId: 'B1-public-profile',
    checks: ['public-profile-main-budget-pass'],
  },
  {
    id: 'P05',
    title: 'Public profile TTFB misses budget',
    kind: 'timing-budget',
    surface: 'public-profile',
    evidence: [
      '`/tim` time-to-first-byte measured 219.6ms against a 200ms budget.',
    ],
    batchId: 'B1-public-profile',
    checks: ['public-profile-main-budget-pass'],
  },
  {
    id: 'P06',
    title: 'Public profile stylesheet budget is exceeded',
    kind: 'resource-budget',
    surface: 'public-profile',
    evidence: ['`/tim` shipped 105.7KB of stylesheets against a 100KB budget.'],
    batchId: 'B1-public-profile',
    checks: ['public-profile-main-budget-pass'],
  },
  {
    id: 'P07',
    title: 'Public profile request count is too high',
    kind: 'network-churn',
    surface: 'public-profile',
    evidence: ['Direct measurement for `/tim` observed 114 requests.'],
    batchId: 'B1-public-profile',
    checks: ['public-profile-direct-metrics'],
  },
  {
    id: 'P08',
    title: 'Public profile never reaches network idle',
    kind: 'network-churn',
    surface: 'public-profile',
    evidence: [
      'A plain Playwright navigation for `/tim` failed to reach `networkidle` within 30s.',
    ],
    batchId: 'B1-public-profile',
    checks: ['public-profile-direct-metrics'],
  },
  {
    id: 'P09',
    title: 'Public profile ships too much JS and CSS',
    kind: 'resource-budget',
    surface: 'public-profile',
    evidence: [
      'Direct measurement for `/tim` observed about 904KB JS and 180KB CSS.',
    ],
    batchId: 'B1-public-profile',
    checks: [
      'public-profile-main-budget-pass',
      'public-profile-direct-metrics',
    ],
  },
  {
    id: 'P10',
    title: 'Creator shell FCP misses budget',
    kind: 'timing-budget',
    surface: 'creator-app',
    evidence: [
      '`/app` first-contentful-paint measured 3716ms against a 1500ms budget.',
    ],
    batchId: 'B2-app-shell',
    checks: ['creator-app-home-budget-pass'],
  },
  {
    id: 'P11',
    title: 'Creator shell LCP misses budget',
    kind: 'timing-budget',
    surface: 'creator-app',
    evidence: [
      '`/app` largest-contentful-paint measured 4380ms against a 3000ms budget.',
    ],
    batchId: 'B2-app-shell',
    checks: ['creator-app-home-budget-pass'],
  },
  {
    id: 'P12',
    title: 'Creator shell skeleton-to-content misses budget',
    kind: 'timing-budget',
    surface: 'creator-app',
    evidence: [
      '`/app` skeleton-to-content measured 3332ms against a 600ms budget.',
    ],
    batchId: 'B2-app-shell',
    checks: ['creator-app-home-budget-pass'],
  },
  {
    id: 'P13',
    title: 'Creator shell total transfer is too large',
    kind: 'resource-budget',
    surface: 'creator-app',
    evidence: [
      'Direct measurement for `/app` observed about 1.44MB total including about 1.13MB JS.',
    ],
    batchId: 'B2-app-shell',
    checks: ['creator-app-home-budget-pass'],
  },
  {
    id: 'P14',
    title: 'Onboarding FCP misses budget',
    kind: 'timing-budget',
    surface: 'onboarding',
    evidence: [
      '`/onboarding` first-contentful-paint measured 1412ms against a 1000ms budget.',
    ],
    batchId: 'B4-onboarding',
    checks: ['onboarding-budget-pass'],
  },
  {
    id: 'P15',
    title: 'Onboarding request count is too high',
    kind: 'network-churn',
    surface: 'onboarding',
    evidence: ['Direct measurement for `/onboarding` observed 106 requests.'],
    batchId: 'B4-onboarding',
    checks: ['onboarding-direct-metrics'],
  },
  {
    id: 'P16',
    title: 'Onboarding ships too much CSS',
    kind: 'resource-budget',
    surface: 'onboarding',
    evidence: [
      'Direct measurement for `/onboarding` observed about 390KB CSS.',
    ],
    batchId: 'B4-onboarding',
    checks: ['onboarding-direct-metrics'],
  },
  {
    id: 'P17',
    title: 'Releases workspace FCP is too slow',
    kind: 'timing-budget',
    surface: 'creator-app',
    evidence: [
      'Direct load for `/app/dashboard/releases` observed about 3032ms FCP.',
    ],
    batchId: 'B3-releases-workspace',
    checks: ['creator-releases-budget-pass', 'creator-releases-direct-metrics'],
  },
  {
    id: 'P18',
    title: 'Releases workspace request count is too high',
    kind: 'network-churn',
    surface: 'creator-app',
    evidence: [
      'Direct load for `/app/dashboard/releases` observed 94 requests.',
    ],
    batchId: 'B3-releases-workspace',
    checks: ['creator-releases-direct-metrics'],
  },
  {
    id: 'P19',
    title: 'Releases workspace JS and CSS payloads are too large',
    kind: 'resource-budget',
    surface: 'creator-app',
    evidence: [
      'Direct load for `/app/dashboard/releases` observed about 822KB JS and 159KB CSS.',
    ],
    batchId: 'B3-releases-workspace',
    checks: ['creator-releases-direct-metrics'],
  },
  {
    id: 'P20',
    title: 'Creator releases harness crashes before producing a summary',
    kind: 'harness-broken',
    surface: 'tooling',
    evidence: ['`creator-releases` exits with `All promises were rejected`.'],
    batchId: 'B0-tooling-trust',
    checks: ['creator-releases-summary'],
  },
  {
    id: 'P21',
    title:
      'Public profile mode-shell harness crashes before producing a summary',
    kind: 'harness-broken',
    surface: 'tooling',
    evidence: [
      '`public-profile-mode-shell` exits with `All promises were rejected`.',
    ],
    batchId: 'B0-tooling-trust',
    checks: ['public-profile-mode-shell-summary'],
  },
  {
    id: 'P22',
    title: 'Perf loop still has a non-production server fallback',
    kind: 'measurement-integrity',
    surface: 'tooling',
    evidence: [
      'Strict perf measurement is invalid when it falls back to `next start` instead of the standalone server.',
    ],
    batchId: 'B0-tooling-trust',
    checks: ['home-summary', 'creator-releases-summary'],
  },
  {
    id: 'P23',
    title: 'Creator-shell auth bootstrap is not canonical',
    kind: 'measurement-integrity',
    surface: 'tooling',
    evidence: [
      'Direct `/app` navigation currently redirects to `/onboarding` for the perf baseline user.',
    ],
    batchId: 'B0-tooling-trust',
    checks: ['creator-app-home-summary', 'creator-releases-summary'],
  },
  {
    id: 'P24',
    title: 'Seeded public-profile avatar data includes a dead image URL',
    kind: 'data-quality',
    surface: 'tooling',
    evidence: [
      'Seeded public-profile fixtures include a live Spotify image URL that now returns 404.',
    ],
    batchId: 'B0-tooling-trust',
    checks: [
      'public-profile-main-summary',
      'public-profile-mode-shell-summary',
    ],
  },
  {
    id: 'P25',
    title: 'Public profile wraps a mostly public page in client providers',
    kind: 'hydration-hotspot',
    surface: 'public-profile',
    evidence: [
      'The public profile route still mounts full client providers around a mostly public page.',
    ],
    batchId: 'B1-public-profile',
    checks: ['public-profile-main-budget-pass'],
  },
  {
    id: 'P26',
    title: 'Public profile mounts multiple client helpers on every view',
    kind: 'hydration-hotspot',
    surface: 'public-profile',
    evidence: [
      'The page mounts profile tracking, pixel tracking, and QR overlay bootstrap on every view.',
    ],
    batchId: 'B1-public-profile',
    checks: [
      'public-profile-main-budget-pass',
      'public-profile-mode-shell-budget-pass',
    ],
  },
  {
    id: 'P27',
    title: 'ProfileCompactTemplate is a critical-path client island',
    kind: 'hydration-hotspot',
    surface: 'public-profile',
    evidence: [
      '`ProfileCompactTemplate` is still a 690-line `use client` component in the public-profile critical path.',
    ],
    batchId: 'B1-public-profile',
    checks: ['public-profile-main-budget-pass'],
  },
  {
    id: 'P28',
    title: 'OnboardingV2Form is a critical-path client island',
    kind: 'hydration-hotspot',
    surface: 'onboarding',
    evidence: [
      '`OnboardingV2Form` is still an 1881-line `use client` component.',
    ],
    batchId: 'B4-onboarding',
    checks: ['onboarding-budget-pass'],
  },
  {
    id: 'P29',
    title: 'Onboarding prefetches too much dashboard data on first render',
    kind: 'server-caching',
    surface: 'onboarding',
    evidence: [
      'The onboarding page still prefetches full dashboard data during the initial render.',
    ],
    batchId: 'B4-onboarding',
    checks: ['onboarding-budget-pass', 'onboarding-direct-metrics'],
  },
  {
    id: 'P30',
    title: 'Dashboard hot paths overuse noStore and repeated auth fetches',
    kind: 'server-caching',
    surface: 'creator-app',
    evidence: [
      'Dashboard hot-path actions still overuse `noStore()` and repeated `getCachedAuth()` calls, especially in releases.',
    ],
    batchId: 'B2-app-shell',
    checks: ['creator-app-home-budget-pass', 'creator-releases-budget-pass'],
  },
] as const satisfies readonly PerfIssue[];

const PERF_BATCHES = [
  {
    id: 'B0-tooling-trust',
    title: 'Tooling Trust',
    branchName: 'itstimwhite/perf-b0-trust',
    issueIds: ['P20', 'P21', 'P22', 'P23', 'P24'],
    localChecks: [
      {
        id: 'home-summary',
        label: 'Home route emits a strict summary',
        kind: 'budget-route',
        expectation: 'summary',
        routeIds: ['home'],
      },
      {
        id: 'public-profile-main-summary',
        label: 'Public profile main route emits a strict summary',
        kind: 'budget-route',
        expectation: 'summary',
        routeIds: ['public-profile-main'],
      },
      {
        id: 'public-profile-mode-shell-summary',
        label: 'Public profile mode-shell group emits a strict summary',
        kind: 'budget-group',
        expectation: 'summary',
        groupIds: ['public-profile-mode-shell'],
      },
      {
        id: 'creator-app-home-summary',
        label:
          'Creator app home emits a strict summary with the ready creator baseline',
        kind: 'budget-route',
        expectation: 'summary',
        authPersona: 'creator-ready',
        routeIds: ['creator-app-home'],
      },
      {
        id: 'creator-releases-summary',
        label:
          'Creator releases emits a strict summary with the ready creator baseline',
        kind: 'budget-route',
        expectation: 'summary',
        authPersona: 'creator-ready',
        routeIds: ['creator-releases'],
      },
      {
        id: 'onboarding-summary',
        label:
          'Onboarding emits a strict summary with the incomplete creator baseline',
        kind: 'budget-route',
        expectation: 'summary',
        authPersona: 'creator',
        routeIds: ['onboarding'],
      },
      {
        id: 'controls-green',
        label: 'Known healthy control routes stay green',
        kind: 'budget-route',
        expectation: 'pass',
        authPersona: 'creator-ready',
        routeIds: ['signup', 'creator-chat', 'public-release'],
      },
    ],
    qaScope: [
      'Re-run screenshot parity for `/tim`, `/app`, `/onboarding`, and `/app/dashboard/releases`.',
      'Verify the ship runner uses the queue handoff instead of falling back to ad hoc perf commands.',
    ],
    shipLabels: ['testing'],
    doneRule:
      'Every selected route id emits a strict summary under the standalone server, no `All promises were rejected` remain, and the queue loop never falls back to `next start`.',
  },
  {
    id: 'B1-public-profile',
    title: 'Public Profile',
    branchName: 'itstimwhite/perf-public-profile',
    issueIds: [
      'P02',
      'P03',
      'P04',
      'P05',
      'P06',
      'P07',
      'P08',
      'P09',
      'P25',
      'P26',
      'P27',
    ],
    localChecks: [
      {
        id: 'public-profile-main-budget-pass',
        label: 'Public profile main route passes strict budgets',
        kind: 'budget-route',
        expectation: 'pass',
        routeIds: ['public-profile-main'],
      },
      {
        id: 'public-profile-mode-shell-budget-pass',
        label: 'Public profile mode-shell routes pass strict budgets',
        kind: 'budget-group',
        expectation: 'pass',
        groupIds: ['public-profile-mode-shell'],
      },
      {
        id: 'public-profile-direct-metrics',
        label:
          'Public profile direct metrics hit the request and network-idle targets',
        kind: 'direct-metrics',
        expectation: 'pass',
        path: '/tim',
        directMetrics: {
          finalPath: '/tim',
          networkIdle: true,
          networkIdleTimeoutMs: 30_000,
          requests: 89,
        },
      },
    ],
    qaScope: [
      'Run screenshot parity on `/tim` after the fully loaded state settles.',
      'QA the public profile drawer modes on desktop and mobile.',
    ],
    shipLabels: ['testing'],
    doneRule:
      '`/tim` passes manifest budgets, reaches `networkidle`, and stays below 90 requests without changing the loaded UI.',
  },
  {
    id: 'B2-app-shell',
    title: 'App Shell',
    branchName: 'itstimwhite/perf-app-shell',
    issueIds: ['P10', 'P11', 'P12', 'P13', 'P30'],
    localChecks: [
      {
        id: 'creator-app-home-budget-pass',
        label:
          'Creator dashboard core routes pass strict budgets with the ready creator baseline',
        kind: 'budget-route',
        expectation: 'pass',
        authPersona: 'creator-ready',
        routeIds: [
          'creator-app-home',
          'creator-audience',
          'creator-earnings',
          'creator-presence',
          'creator-release-tasks',
        ],
      },
    ],
    qaScope: [
      'Verify `/app`, audience, earnings, presence, and release-tasks parity for the ready-creator persona.',
      'Check sidebar navigation and chat shell after the perf changes land.',
    ],
    shipLabels: ['testing'],
    doneRule:
      'Core creator dashboard routes (`/app`, audience, earnings, presence, and release tasks) pass strict budgets with the canonical ready-creator auth baseline.',
  },
  {
    id: 'B3-releases-workspace',
    title: 'Releases Workspace',
    branchName: 'itstimwhite/perf-releases',
    issueIds: ['P17', 'P18', 'P19'],
    localChecks: [
      {
        id: 'creator-releases-budget-pass',
        label: 'Creator releases passes strict budgets',
        kind: 'budget-route',
        expectation: 'pass',
        authPersona: 'creator-ready',
        routeIds: ['creator-releases'],
      },
      {
        id: 'creator-releases-direct-metrics',
        label: 'Creator releases direct metrics hit the request and JS targets',
        kind: 'direct-metrics',
        expectation: 'pass',
        authPersona: 'creator-ready',
        path: APP_ROUTES.DASHBOARD_RELEASES,
        directMetrics: {
          finalPath: APP_ROUTES.DASHBOARD_RELEASES,
          requests: 69,
          scriptKB: 700,
        },
      },
    ],
    qaScope: [
      'Re-run screenshot parity for the releases matrix and sidebar flows.',
      'QA direct loads and warm navigations into Releases.',
    ],
    shipLabels: ['testing'],
    doneRule:
      '`creator-releases` passes its strict checks, the direct load stays below 70 requests, and JS stays below 700KB.',
  },
  {
    id: 'B4-onboarding',
    title: 'Onboarding',
    branchName: 'itstimwhite/perf-onboarding',
    issueIds: ['P14', 'P15', 'P16', 'P28', 'P29'],
    localChecks: [
      {
        id: 'onboarding-budget-pass',
        label:
          'Onboarding passes strict budgets with the incomplete creator baseline',
        kind: 'budget-route',
        expectation: 'pass',
        authPersona: 'creator',
        routeIds: ['onboarding'],
      },
      {
        id: 'onboarding-direct-metrics',
        label: 'Onboarding direct metrics hit the request and CSS targets',
        kind: 'direct-metrics',
        expectation: 'pass',
        authPersona: 'creator',
        path: '/onboarding',
        directMetrics: {
          cssKB: 220,
          finalPath: '/onboarding',
          requests: 79,
        },
      },
    ],
    qaScope: [
      'Run screenshot parity on onboarding after the client form finishes hydrating.',
      'QA the full onboarding flow with the incomplete creator baseline.',
    ],
    shipLabels: ['testing'],
    doneRule:
      '`/onboarding` passes manifest budgets, stays below 80 requests, and ships less than 220KB CSS.',
  },
  {
    id: 'B5-home',
    title: 'Home',
    branchName: 'itstimwhite/perf-home',
    issueIds: ['P01'],
    localChecks: [
      {
        id: 'home-budget-pass',
        label: 'Home passes strict budgets',
        kind: 'budget-route',
        expectation: 'pass',
        routeIds: ['home'],
      },
    ],
    qaScope: [
      'Run screenshot parity for `/` at the loaded state.',
      'QA desktop and mobile hero hydration on the homepage.',
    ],
    shipLabels: ['testing'],
    doneRule:
      '`/` passes the home shell-ready budget without changing the fully loaded homepage.',
  },
] as const satisfies readonly PerfBatch[];

export function getPerfIssueManifest() {
  return [...PERF_ISSUES];
}

export function getPerfBatchManifest() {
  return [...PERF_BATCHES];
}

export function getPerfIssueById(issueId: string) {
  return PERF_ISSUES.find(issue => issue.id === issueId);
}

export function getPerfBatchById(batchId: string) {
  return PERF_BATCHES.find(batch => batch.id === batchId);
}

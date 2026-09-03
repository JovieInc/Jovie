import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type {
  HudMetricSourceKey,
  HudMetricSourceTrust,
  HudMetrics,
} from '@/types/hud';
import { HudCashMrrBand } from './HudCashMrrBand';

const observedAtIso = '2026-08-22T18:00:00.000Z';

function source(
  key: HudMetricSourceKey,
  label: string,
  dashboardUrl: string | null = null
): HudMetricSourceTrust {
  return {
    key,
    label,
    state: 'ok',
    fetchedAtIso: observedAtIso,
    errorMessage: null,
    dashboardUrl,
    configureUrl: null,
    nextStep: null,
  };
}

const metrics = {
  accessMode: 'admin',
  branding: {
    startupName: 'Jovie',
    logoUrl: null,
  },
  overview: {
    mrrUsd: 5200,
    activeSubscribers: 42,
    balanceUsd: 100000,
    burnRateUsd: 30000,
    runwayMonths: 4,
    defaultStatus: 'alive',
    defaultStatusDetail: 'Runway covers the profitability horizon.',
    financialDataAvailable: true,
  },
  operations: {
    status: 'ok',
    dbLatencyMs: 42,
    checkedAtIso: observedAtIso,
  },
  reliability: {
    errorRatePercent: 0.4,
    reliabilityScorePercent: 99.6,
    p95LatencyMs: 280,
    incidents24h: 0,
    lastIncidentAtIso: null,
    unresolvedSentryIssues24h: 0,
  },
  testing: {
    quarantine: {
      activeCount: 0,
      expiredCount: 0,
      expiringSoonCount: 0,
      unitCount: 0,
      e2eCount: 0,
      estimatedRetryAttemptsPerRun: 0,
      retryBudgetCap: 4,
      retryBudgetUsagePercent: 0,
      withinRetryBudget: true,
      unitDefaultRetries: 1,
      quarantineUnitRetries: 2,
      quarantineE2eRetries: 1,
      isValid: true,
      ledgerPath: 'apps/web/tests/quarantine-ledger.json',
    },
  },
  deployments: {
    availability: 'available',
    current: null,
    recent: [],
  },
  aiOps: {
    availability: 'available',
    generatedAtIso: observedAtIso,
    counts: {
      queued: 0,
      running: 0,
      blocked: 1,
      review: 0,
      done: 0,
      failed: 1,
      stale: 0,
    },
    dispatch: {
      available: true,
      unavailableReason: null,
      runtimes: ['codex-cli'],
    },
    mergeQueue: {
      openAgentPrs: 4,
      openAgentPrThreshold: 10,
      pressure: 'normal',
    },
    runs: [],
    blockers: [],
    recommendations: [],
    sources: {
      github: { availability: 'available', configured: true, itemCount: 0 },
      linear: { availability: 'available', configured: true, itemCount: 0 },
      sentry: { availability: 'available', configured: true, itemCount: 0 },
      hermes: { availability: 'available', configured: true, itemCount: 0 },
      'hermes-air': {
        availability: 'available',
        configured: true,
        itemCount: 0,
      },
      ci: { availability: 'available', configured: true, itemCount: 0 },
    },
  },
  sources: {
    stripe: source('stripe', 'Stripe', 'https://dashboard.stripe.com/'),
    mercury: source('mercury', 'Mercury', 'https://app.mercury.com/'),
    database: source('database', 'Database'),
    sentry: source('sentry', 'Sentry'),
    github: source('github', 'GitHub'),
  },
  agentRuns: [],
  generatedAtIso: observedAtIso,
} satisfies HudMetrics;

const meta = {
  title: 'Features/Admin/Hud/HudCashMrrBand',
  component: HudCashMrrBand,
  parameters: {
    layout: 'centered',
  },
  args: {
    metrics,
    mrrValueClass: 'text-3xl font-[620] leading-none',
    runwayValueClass: 'text-3xl font-[620] leading-none',
    onRetry: () => {},
  },
} satisfies Meta<typeof HudCashMrrBand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

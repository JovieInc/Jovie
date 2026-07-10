/**
 * VC/ops revenue-lift dashboard loader (JOV-3619).
 *
 * Aggregates the North Star (IRPAA) + KPI tree + cohort strip + multi-agent
 * contribution from the canonical metrics modules — zero inline formula
 * duplication. Every tile carries a data-source label + fetch timestamp.
 */

import 'server-only';

import { getAgentTaskMetrics } from '@/lib/analytics/agent-task-metrics';
import { getOpportunityCycleTime } from '@/lib/analytics/opportunity-cycle-time';
import {
  type ArtistCohortRevenueRow,
  listArtistCohortRevenueRows,
} from '@/lib/metrics/artist-revenue-cohorts';
import {
  getIRPAA,
  getRolling30DayIRPAA,
  type IrpaaResult,
} from '@/lib/metrics/irpaa';
import { getRevenueLiftWeightsSnapshot } from '@/lib/metrics/revenue-lift-weights';
import { logger } from '@/lib/utils/logger';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface MetricSourceMeta {
  readonly label: string;
  readonly source: string;
  readonly fetchedAtIso: string;
  readonly state: 'ok' | 'no_data' | 'unavailable';
  readonly errorMessage: string | null;
}

export interface RevenueLiftKpiTile {
  readonly id: string;
  readonly tier: 'A' | 'B' | 'C';
  readonly label: string;
  readonly valueLabel: string;
  readonly signal: string;
  readonly vcInterpretation: string;
  readonly source: MetricSourceMeta;
}

export interface CohortSummary {
  readonly activeCount: number;
  readonly controlCount: number;
  readonly activeMedianLiftCents: number | null;
  readonly controlMedianLiftCents: number | null;
  readonly rows: readonly ArtistCohortRevenueRow[];
  readonly source: MetricSourceMeta;
}

export interface AgentContributionRow {
  readonly agent: string;
  readonly totalTasks: number;
  readonly successRate: number;
  readonly humanOverrideRate: number;
  readonly costPerOpportunityUsd: number | null;
  readonly totalCostUsd: number;
}

export interface RevenueLiftDashboardData {
  readonly generatedAtIso: string;
  readonly irpaa: IrpaaResult | null;
  readonly irpaaPrior: IrpaaResult | null;
  readonly irpaaSource: MetricSourceMeta;
  readonly kpiTree: readonly RevenueLiftKpiTile[];
  readonly interpretationTable: readonly RevenueLiftKpiTile[];
  readonly cohorts: CohortSummary;
  readonly agents: readonly AgentContributionRow[];
  readonly agentsSource: MetricSourceMeta;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

function sourceOk(
  label: string,
  source: string,
  fetchedAtIso: string,
  hasData: boolean
): MetricSourceMeta {
  return {
    label,
    source,
    fetchedAtIso,
    state: hasData ? 'ok' : 'no_data',
    errorMessage: null,
  };
}

function sourceUnavailable(
  label: string,
  source: string,
  fetchedAtIso: string,
  error: unknown
): MetricSourceMeta {
  return {
    label,
    source,
    fetchedAtIso,
    state: 'unavailable',
    errorMessage: error instanceof Error ? error.message : String(error),
  };
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents >= 100_00 ? 0 : 2,
  }).format(cents / 100);
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatMs(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

/**
 * Load the full revenue-lift dashboard snapshot for a rolling window.
 * Failures on secondary tiles degrade to empty + unavailable source meta;
 * IRPAA remains the hero path.
 */
export async function loadRevenueLiftDashboard(
  now: Date = new Date()
): Promise<RevenueLiftDashboardData> {
  const fetchedAtIso = now.toISOString();
  const window30 = {
    start: new Date(now.getTime() - 30 * MS_PER_DAY),
    end: now,
  };
  const windowPrior = {
    start: new Date(now.getTime() - 60 * MS_PER_DAY),
    end: new Date(now.getTime() - 30 * MS_PER_DAY),
  };

  let irpaa: IrpaaResult | null = null;
  let irpaaPrior: IrpaaResult | null = null;
  let irpaaSource: MetricSourceMeta;

  try {
    [irpaa, irpaaPrior] = await Promise.all([
      getRolling30DayIRPAA(now),
      getIRPAA(windowPrior),
    ]);
    irpaaSource = sourceOk(
      'IRPAA',
      'getRolling30DayIRPAA → workflow_run_outcomes + revenue-lift-weights',
      fetchedAtIso,
      irpaa.activeArtists > 0 || irpaa.runCount > 0
    );
  } catch (error) {
    logger.error('[revenue-lift-dashboard] IRPAA load failed', error);
    irpaaSource = sourceUnavailable(
      'IRPAA',
      'getRolling30DayIRPAA → workflow_run_outcomes + revenue-lift-weights',
      fetchedAtIso,
      error
    );
  }

  let cohortRows: ArtistCohortRevenueRow[] = [];
  let cohortSource: MetricSourceMeta;
  try {
    cohortRows = await listArtistCohortRevenueRows({ window: window30 });
    cohortSource = sourceOk(
      'Artist cohorts',
      'listArtistCohortRevenueRows → artist_revenue_cohorts + revenue signals',
      fetchedAtIso,
      cohortRows.length > 0
    );
  } catch (error) {
    logger.error('[revenue-lift-dashboard] cohort load failed', error);
    cohortSource = sourceUnavailable(
      'Artist cohorts',
      'listArtistCohortRevenueRows → artist_revenue_cohorts + revenue signals',
      fetchedAtIso,
      error
    );
  }

  const activeRows = cohortRows.filter(r => r.cohort === 'jovie_active');
  const controlRows = cohortRows.filter(r => r.cohort === 'control');
  const activeLifts = activeRows
    .map(r => r.liftCents)
    .filter((v): v is number => v != null);
  const controlLifts = controlRows
    .map(r => r.liftCents)
    .filter((v): v is number => v != null);

  const cohorts: CohortSummary = {
    activeCount: activeRows.length,
    controlCount: controlRows.length,
    activeMedianLiftCents: median(activeLifts),
    controlMedianLiftCents: median(controlLifts),
    rows: cohortRows.slice(0, 50),
    source: cohortSource,
  };

  let agents: AgentContributionRow[] = [];
  let agentsSource: MetricSourceMeta;
  try {
    const metrics = await getAgentTaskMetrics({
      since: window30.start,
      until: window30.end,
    });
    agents = metrics.map(m => ({
      agent: m.agent,
      totalTasks: m.totalTasks,
      successRate: m.successRate,
      humanOverrideRate: m.humanOverrideRate,
      costPerOpportunityUsd: m.costPerOpportunityUsd,
      totalCostUsd: m.totalCostUsd,
    }));
    agentsSource = sourceOk(
      'Multi-agent contribution',
      'getAgentTaskMetrics → workflow_step_results',
      fetchedAtIso,
      agents.length > 0
    );
  } catch (error) {
    logger.error('[revenue-lift-dashboard] agent metrics failed', error);
    agentsSource = sourceUnavailable(
      'Multi-agent contribution',
      'getAgentTaskMetrics → workflow_step_results',
      fetchedAtIso,
      error
    );
  }

  let medianCycleMs: number | null = null;
  let cycleSource: MetricSourceMeta;
  try {
    const cycleRows = await getOpportunityCycleTime({
      since: window30.start,
      until: window30.end,
    });
    const allMedians = cycleRows.map(r => r.medianCycleTimeMs);
    medianCycleMs = median(allMedians);
    cycleSource = sourceOk(
      'Opportunity cycle time',
      'getOpportunityCycleTime → suggested_actions × workflow_runs',
      fetchedAtIso,
      cycleRows.length > 0
    );
  } catch (error) {
    logger.error('[revenue-lift-dashboard] cycle time failed', error);
    cycleSource = sourceUnavailable(
      'Opportunity cycle time',
      'getOpportunityCycleTime → suggested_actions × workflow_runs',
      fetchedAtIso,
      error
    );
  }

  const weights = getRevenueLiftWeightsSnapshot();
  const totalOverrideRate =
    agents.length > 0
      ? agents.reduce((s, a) => s + a.humanOverrideRate * a.totalTasks, 0) /
        Math.max(
          1,
          agents.reduce((s, a) => s + a.totalTasks, 0)
        )
      : 0;
  const totalSuccessRate =
    agents.length > 0
      ? agents.reduce((s, a) => s + a.successRate * a.totalTasks, 0) /
        Math.max(
          1,
          agents.reduce((s, a) => s + a.totalTasks, 0)
        )
      : 0;

  const kpiTree: RevenueLiftKpiTile[] = [
    {
      id: 'irpaa',
      tier: 'A',
      label: 'IRPAA (30d)',
      valueLabel: irpaa ? formatCents(irpaa.irpaaCents) : '—',
      signal: irpaa
        ? `${irpaa.activeArtists} active artists · ${irpaa.runCount} runs · weights ${weights.version}`
        : 'No IRPAA snapshot',
      vcInterpretation:
        'North Star: incremental revenue per active artist from Jovie-shipped automations. Up-and-to-the-right proves the claim.',
      source: irpaaSource,
    },
    {
      id: 'gmv-lift',
      tier: 'B',
      label: 'Direct GMV Lift',
      valueLabel: irpaa ? formatCents(irpaa.totals.gmvDeltaCents) : '—',
      signal: 'Σ workflow_run_outcomes.gmv_delta_cents (real merch GMV)',
      vcInterpretation:
        'Real dollars settled via Stripe/Printful, attributed only through the automation spine.',
      source: irpaaSource,
    },
    {
      id: 'dsp-clicks',
      tier: 'B',
      label: 'DSP Click Delta',
      valueLabel: irpaa ? String(irpaa.totals.dspClickDelta) : '—',
      signal: `Proxy · ${weights.streamingValueWeightCentsPerDspClick}¢ / click (weights ${weights.version})`,
      vcInterpretation:
        'Streaming value proxy until royalty feeds land; always labeled with the weight version.',
      source: irpaaSource,
    },
    {
      id: 'new-fans',
      tier: 'B',
      label: 'New Fans Delta',
      valueLabel: irpaa ? String(irpaa.totals.newFansDelta) : '—',
      signal: `Proxy · ${weights.fanCaptureLtvWeightCentsPerFan}¢ LTV / fan (weights ${weights.version})`,
      vcInterpretation:
        'Fan-capture LTV proxy; validated against realized tips/GMV on a 30-day cadence.',
      source: irpaaSource,
    },
    {
      id: 'cohort-lift',
      tier: 'B',
      label: 'Active vs Control Lift',
      valueLabel:
        cohorts.activeMedianLiftCents != null
          ? `${formatCents(cohorts.activeMedianLiftCents)} vs ${
              cohorts.controlMedianLiftCents != null
                ? formatCents(cohorts.controlMedianLiftCents)
                : '—'
            }`
          : '—',
      signal: `${cohorts.activeCount} active · ${cohorts.controlCount} control (median lift)`,
      vcInterpretation:
        'Holdout signal: active-artist median lift should exceed control, or attribution is noise.',
      source: cohortSource,
    },
    {
      id: 'cycle-time',
      tier: 'C',
      label: 'Opportunity Cycle Time',
      valueLabel: formatMs(medianCycleMs),
      signal: 'Median detected → shipped across opportunity kinds',
      vcInterpretation:
        'System health: faster cycle time means the agentic loop is compounding.',
      source: cycleSource,
    },
    {
      id: 'agent-success',
      tier: 'C',
      label: 'Agent Success Rate',
      valueLabel: agents.length > 0 ? formatRate(totalSuccessRate) : '—',
      signal: `${agents.reduce((s, a) => s + a.totalTasks, 0)} steps / 30d`,
      vcInterpretation:
        'Traction for multi-agent ops — high success with low override is leverage.',
      source: agentsSource,
    },
    {
      id: 'human-override',
      tier: 'C',
      label: 'Human Override Rate',
      valueLabel: agents.length > 0 ? formatRate(totalOverrideRate) : '—',
      signal: 'human_override / total workflow_step_results',
      vcInterpretation:
        'Trust tax: override rate falling over time is the path to full autonomy.',
      source: agentsSource,
    },
  ];

  return {
    generatedAtIso: fetchedAtIso,
    irpaa,
    irpaaPrior,
    irpaaSource,
    kpiTree,
    interpretationTable: kpiTree,
    cohorts,
    agents,
    agentsSource,
  };
}

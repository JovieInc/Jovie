import { formatUsd } from '@/lib/admin/format';
import { formatSourceFreshness, isSourceStale } from '@/lib/hud/source-trust';
import type { RevenueLiftDashboardData } from '@/lib/metrics/revenue-lift-dashboard';
import { formatAmount } from '@/lib/utils/format-number';

interface RevenueLiftDashboardViewProps {
  readonly data: RevenueLiftDashboardData;
}

function SourceLine({
  source,
}: Readonly<{
  source: RevenueLiftDashboardData['irpaaSource'];
}>) {
  const stale = isSourceStale(source.fetchedAtIso);
  return (
    <p className='mt-2 min-h-5 text-2xs leading-4 text-tertiary-token'>
      <span className='font-medium text-secondary-token'>{source.label}</span>
      {' · '}
      {source.state === 'unavailable'
        ? (source.errorMessage ?? 'Unavailable')
        : source.state === 'no_data'
          ? 'No data'
          : stale
            ? `Stale · updated ${formatSourceFreshness(source.fetchedAtIso)}`
            : `Updated ${formatSourceFreshness(source.fetchedAtIso)}`}
      <span className='block truncate' title={source.source}>
        Source: {source.source}
      </span>
    </p>
  );
}

function KpiTile({
  tile,
}: Readonly<{
  tile: RevenueLiftDashboardData['kpiTree'][number];
}>) {
  return (
    <div
      className='rounded-md border border-subtle bg-surface-1 p-4'
      data-testid={`revenue-lift-kpi-${tile.id}`}
    >
      <div className='flex items-start justify-between gap-2'>
        <p className='text-xs font-medium text-secondary-token'>{tile.label}</p>
        <span className='rounded bg-surface-0 px-1.5 py-0.5 text-2xs font-medium text-tertiary-token'>
          Tier {tile.tier}
        </span>
      </div>
      <p className='mt-2 min-h-8 text-2xl font-semibold tracking-tight text-primary-token'>
        {tile.valueLabel}
      </p>
      <p className='mt-1 min-h-8 text-xs text-secondary-token'>{tile.signal}</p>
      <SourceLine source={tile.source} />
    </div>
  );
}

export function RevenueLiftDashboardView({
  data,
}: RevenueLiftDashboardViewProps) {
  const irpaa = data.irpaa;
  const prior = data.irpaaPrior;
  const deltaCents =
    irpaa && prior ? irpaa.irpaaCents - prior.irpaaCents : null;
  const deltaLabel =
    deltaCents == null
      ? null
      : `${deltaCents >= 0 ? '+' : ''}${formatAmount(deltaCents)} vs prior 30d`;

  return (
    <div className='space-y-6' data-testid='revenue-lift-dashboard'>
      {/* North Star hero */}
      <section
        className='rounded-md border border-subtle bg-surface-1 p-5'
        data-testid='revenue-lift-irpaa-hero'
        aria-labelledby='revenue-lift-irpaa-heading'
      >
        <p className='text-xs font-medium text-secondary-token'>
          North Star · Tier A
        </p>
        <h2
          id='revenue-lift-irpaa-heading'
          className='mt-1 text-sm font-medium text-primary-token'
        >
          Incremental Revenue per Active Artist (IRPAA)
        </h2>
        <p className='mt-3 min-h-10 text-4xl font-semibold tracking-tight text-primary-token'>
          {irpaa ? formatAmount(irpaa.irpaaCents) : '—'}
        </p>
        <p className='mt-1 min-h-5 text-sm text-secondary-token'>
          {deltaLabel ?? 'Prior-window comparison unavailable'}
          {irpaa
            ? ` · ${irpaa.activeArtists} active artists · ${irpaa.runCount} automation runs`
            : null}
        </p>
        <p className='mt-2 text-xs text-secondary-token'>
          Total lift {irpaa ? formatAmount(irpaa.totalRevenueLiftCents) : '—'}{' '}
          over the rolling 30-day window. Weights{' '}
          {irpaa?.weights.version ?? '—'}
          {irpaa?.weights.lastValidatedAt
            ? ` (validated ${irpaa.weights.lastValidatedAt})`
            : ''}
          .
        </p>
        <SourceLine source={data.irpaaSource} />
      </section>

      {/* KPI tree */}
      <section aria-labelledby='revenue-lift-kpi-heading'>
        <h2
          id='revenue-lift-kpi-heading'
          className='mb-3 text-sm font-medium text-primary-token'
        >
          KPI Tree
        </h2>
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          {data.kpiTree
            .filter(t => t.id !== 'irpaa')
            .map(tile => (
              <KpiTile key={tile.id} tile={tile} />
            ))}
        </div>
      </section>

      {/* Metric → Signal → VC Interpretation */}
      <section aria-labelledby='revenue-lift-map-heading'>
        <h2
          id='revenue-lift-map-heading'
          className='mb-3 text-sm font-medium text-primary-token'
        >
          Metric → Signal → VC Interpretation
        </h2>
        <div className='overflow-x-auto rounded-md border border-subtle bg-surface-1'>
          <table className='w-full min-w-[40rem] text-left text-sm'>
            <thead className='border-b border-subtle bg-(--linear-app-content-surface) text-xs text-secondary-token'>
              <tr>
                <th className='px-3 py-2 font-medium'>Metric</th>
                <th className='px-3 py-2 font-medium'>Value</th>
                <th className='px-3 py-2 font-medium'>Signal</th>
                <th className='px-3 py-2 font-medium'>VC Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {data.interpretationTable.map(row => (
                <tr
                  key={row.id}
                  className='border-b border-subtle last:border-0'
                  data-testid={`revenue-lift-map-${row.id}`}
                >
                  <td className='px-3 py-2 align-top font-medium text-primary-token'>
                    {row.label}
                    <span className='mt-0.5 block text-2xs font-normal text-tertiary-token'>
                      Tier {row.tier}
                    </span>
                  </td>
                  <td className='px-3 py-2 align-top text-primary-token'>
                    {row.valueLabel}
                  </td>
                  <td className='px-3 py-2 align-top text-secondary-token'>
                    {row.signal}
                    <span className='mt-0.5 block text-2xs text-tertiary-token'>
                      {row.source.source}
                    </span>
                  </td>
                  <td className='px-3 py-2 align-top text-secondary-token'>
                    {row.vcInterpretation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cohort strip */}
      <section aria-labelledby='revenue-lift-cohort-heading'>
        <h2
          id='revenue-lift-cohort-heading'
          className='mb-3 text-sm font-medium text-primary-token'
        >
          Per-Artist Cohort
        </h2>
        <div className='mb-3 grid gap-3 sm:grid-cols-2'>
          <div className='rounded-md border border-subtle bg-surface-1 p-4'>
            <p className='text-xs font-medium text-secondary-token'>
              Jovie Active
            </p>
            <p className='mt-1 text-2xl font-semibold text-primary-token'>
              {data.cohorts.activeCount}
            </p>
            <p className='mt-1 text-xs text-secondary-token'>
              Median lift{' '}
              {data.cohorts.activeMedianLiftCents != null
                ? formatAmount(data.cohorts.activeMedianLiftCents)
                : '—'}
            </p>
          </div>
          <div className='rounded-md border border-subtle bg-surface-1 p-4'>
            <p className='text-xs font-medium text-secondary-token'>Control</p>
            <p className='mt-1 text-2xl font-semibold text-primary-token'>
              {data.cohorts.controlCount}
            </p>
            <p className='mt-1 text-xs text-secondary-token'>
              Median lift{' '}
              {data.cohorts.controlMedianLiftCents != null
                ? formatAmount(data.cohorts.controlMedianLiftCents)
                : '—'}
            </p>
          </div>
        </div>
        <SourceLine source={data.cohorts.source} />
        <div className='mt-3 overflow-x-auto rounded-md border border-subtle bg-surface-1'>
          <table className='w-full min-w-[32rem] text-left text-sm'>
            <thead className='border-b border-subtle bg-(--linear-app-content-surface) text-xs text-secondary-token'>
              <tr>
                <th className='px-3 py-2 font-medium'>User</th>
                <th className='px-3 py-2 font-medium'>Cohort</th>
                <th className='px-3 py-2 font-medium'>Signal</th>
                <th className='px-3 py-2 font-medium'>Baseline</th>
                <th className='px-3 py-2 font-medium'>Lift</th>
              </tr>
            </thead>
            <tbody>
              {data.cohorts.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className='px-3 py-6 text-center text-secondary-token'
                  >
                    No cohort rows yet. Artists are tagged when automation
                    outcomes land.
                  </td>
                </tr>
              ) : (
                data.cohorts.rows.map(row => (
                  <tr
                    key={row.userId}
                    className='border-b border-subtle last:border-0'
                  >
                    <td className='px-3 py-2 font-mono text-xs text-primary-token'>
                      {row.userId.slice(0, 12)}…
                    </td>
                    <td className='px-3 py-2 text-secondary-token'>
                      {row.cohort === 'jovie_active' ? 'Active' : 'Control'}
                    </td>
                    <td className='px-3 py-2 text-primary-token'>
                      {row.signal
                        ? formatAmount(row.signal.revenueSignalCents)
                        : '—'}
                    </td>
                    <td className='px-3 py-2 text-secondary-token'>
                      {formatAmount(row.baselineRevenueSignalCents)}
                    </td>
                    <td className='px-3 py-2 text-primary-token'>
                      {row.liftCents != null
                        ? formatAmount(row.liftCents)
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Multi-agent contribution */}
      <section aria-labelledby='revenue-lift-agents-heading'>
        <h2
          id='revenue-lift-agents-heading'
          className='mb-3 text-sm font-medium text-primary-token'
        >
          Multi-Agent Contribution
        </h2>
        <div className='overflow-x-auto rounded-md border border-subtle bg-surface-1'>
          <table className='w-full min-w-[36rem] text-left text-sm'>
            <thead className='border-b border-subtle bg-(--linear-app-content-surface) text-xs text-secondary-token'>
              <tr>
                <th className='px-3 py-2 font-medium'>Agent</th>
                <th className='px-3 py-2 font-medium'>Tasks</th>
                <th className='px-3 py-2 font-medium'>Success</th>
                <th className='px-3 py-2 font-medium'>Override</th>
                <th className='px-3 py-2 font-medium'>Cost / Opp</th>
                <th className='px-3 py-2 font-medium'>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.agents.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className='px-3 py-6 text-center text-secondary-token'
                  >
                    No workflow_step_results in the last 30 days.
                  </td>
                </tr>
              ) : (
                data.agents.map(agent => (
                  <tr
                    key={agent.agent}
                    className='border-b border-subtle last:border-0'
                    data-testid={`revenue-lift-agent-${agent.agent}`}
                  >
                    <td className='px-3 py-2 font-medium text-primary-token'>
                      {agent.agent}
                    </td>
                    <td className='px-3 py-2 text-secondary-token'>
                      {agent.totalTasks}
                    </td>
                    <td className='px-3 py-2 text-secondary-token'>
                      {(agent.successRate * 100).toFixed(1)}%
                    </td>
                    <td className='px-3 py-2 text-secondary-token'>
                      {(agent.humanOverrideRate * 100).toFixed(1)}%
                    </td>
                    <td className='px-3 py-2 text-secondary-token'>
                      {agent.costPerOpportunityUsd != null
                        ? formatUsd(agent.costPerOpportunityUsd)
                        : '—'}
                    </td>
                    <td className='px-3 py-2 text-secondary-token'>
                      {formatUsd(agent.totalCostUsd)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <SourceLine source={data.agentsSource} />
      </section>

      <p className='text-2xs text-tertiary-token'>
        Generated {formatSourceFreshness(data.generatedAtIso)}. Proxy terms
        always carry the weights version; see docs/REVENUE_LIFT_METRICS.md.
      </p>
    </div>
  );
}

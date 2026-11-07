'use client';

import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { TimeLeverage } from '@/lib/ovie/time-leverage';
import { useTimeLeverageQuery } from '@/lib/queries/useTimeLeverageQuery';

export function TimeLeverageView({
  data,
}: Readonly<{ readonly data: TimeLeverage }>) {
  const { tim, agent, proposals } = data;
  const leak = tim.categories.find(c => c.class === 'automatable');
  return (
    <ContentSurfaceCard
      surface='details'
      className='min-w-0'
      aria-label='Time Leverage'
      data-testid='hud-time-leverage'
    >
      <div className='space-y-2 p-3'>
        <p className='text-xs font-caption text-tertiary-token'>
          Tim time, {data.windowDays}d
        </p>
        <p className='text-app text-primary-token tabular-nums'>
          {tim.humanOnlyPct === null
            ? 'n/a'
            : `${Math.round(tim.humanOnlyPct)}%`}{' '}
          human-only
          <span className='text-secondary-token'>
            {' '}
            of {(tim.totalMinutes / 60).toFixed(1)}h
          </span>
        </p>
        <p className='truncate text-xs tabular-nums text-secondary-token'>
          {leak
            ? `Top leak: ${leak.label.toLowerCase()}, ${Math.round(leak.minutes)} min`
            : 'No automatable leak'}
          {agent.wastedAgentHours === null
            ? ''
            : ` · ${Math.round(agent.wastedAgentHours)} agent-h wasted`}
        </p>
        {proposals.length > 0 ? (
          <ol className='grid gap-1'>
            {proposals.map((p, index) => (
              <li key={p.id} className='truncate text-xs text-secondary-token'>
                {index + 1}. {p.title} · {p.estimate} · {p.owner}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </ContentSurfaceCard>
  );
}

/** Renders nothing until the weekly aggregate arrives; never blocks the HUD. */
export function TimeLeverageCard({ isAdmin }: Readonly<{ isAdmin: boolean }>) {
  const { data } = useTimeLeverageQuery(isAdmin);
  if (!isAdmin || !data) return null;
  return <TimeLeverageView data={data} />;
}

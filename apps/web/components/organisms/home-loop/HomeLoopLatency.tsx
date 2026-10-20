// @coverage-via apps/web/components/organisms/home-loop/HomeLoopParts.test.tsx

import { TrendingUp } from 'lucide-react';
import type { HomeLoopLatencyRow } from '@/lib/home-loop/contract';
import { cn } from '@/lib/utils';

/**
 * Slowest stages by 7-day p95, with regressions named in text. This is the
 * list Home asks the team to drive down; durations arrive pre-formatted and
 * unknown values read "Not measured".
 */
export function HomeLoopLatency({
  rows,
  otherRegressions = [],
  coverage,
}: Readonly<{
  readonly rows: readonly HomeLoopLatencyRow[];
  readonly otherRegressions?: readonly string[];
  readonly coverage?: string | null;
}>) {
  return (
    <div
      className='rounded-lg border border-subtle bg-surface-1 px-3'
      data-testid='home-loop-latency'
    >
      <table className='w-full text-xs'>
        <caption className='sr-only'>Slowest stages by 7-day p95</caption>
        <thead>
          <tr className='text-left text-2xs text-tertiary-token'>
            <th scope='col' className='py-1.5 font-normal'>
              Stage
            </th>
            <th scope='col' className='py-1.5 text-right font-normal'>
              p50
            </th>
            <th scope='col' className='py-1.5 text-right font-normal'>
              p95
            </th>
            <th scope='col' className='py-1.5 text-right font-normal'>
              Runs
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={row.id}
              className='border-t border-subtle'
              data-regressed={row.regressed}
              data-testid='home-loop-latency-row'
            >
              <th
                scope='row'
                className='max-w-0 truncate py-1.5 pr-2 text-left font-normal text-primary-token'
                title={row.label}
              >
                {row.label}
                {row.regressed ? (
                  <span className='ml-1.5 inline-flex items-center gap-0.5 text-warning'>
                    <TrendingUp aria-hidden='true' className='size-3' />
                    Regressed
                  </span>
                ) : null}
              </th>
              <td className='py-1.5 text-right tabular-nums text-secondary-token'>
                {row.p50}
              </td>
              <td
                className={cn(
                  'py-1.5 text-right font-medium tabular-nums',
                  row.regressed ? 'text-warning' : 'text-primary-token'
                )}
              >
                {row.p95}
              </td>
              <td className='py-1.5 text-right tabular-nums text-tertiary-token'>
                {row.samples}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {otherRegressions.length > 0 || coverage ? (
        <p className='border-t border-subtle py-1.5 text-2xs text-tertiary-token'>
          {otherRegressions.length > 0 ? (
            <span className='text-warning'>
              {`Also regressed: ${otherRegressions.join(', ')}`}
            </span>
          ) : null}
          {otherRegressions.length > 0 && coverage ? ' · ' : null}
          {coverage}
        </p>
      ) : null}
    </div>
  );
}

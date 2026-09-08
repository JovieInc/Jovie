'use client';

import { Button } from '@jovie/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ShippingVelocityChart } from '@/components/features/admin/ShippingVelocityChart';
import {
  parseShippingCockpitProjection,
  type ShippingCockpitProjection,
} from '@/lib/ovie/shipping-state/client';

export function pipelineRows(
  projection: ShippingCockpitProjection | undefined,
  now: number
) {
  const definitions = [
    ['Running', 'symphony-runtime', 'running'],
    ['Retrying', 'symphony-runtime', 'retrying'],
    ['Blocked', 'symphony-runtime', 'blocked'],
    ['Open Pull Requests', 'github-native-merge-queue', 'openPullRequests'],
    ['Native merge queue', 'github-native-merge-queue', 'queued'],
  ] as const;
  return definitions.map(([label, id, field]) => {
    const source = projection?.sources[id];
    const deadline = source ? Date.parse(source.freshnessDeadline) : Number.NaN;
    const fresh =
      source?.state === 'fresh' && Number.isFinite(deadline) && now <= deadline;
    const state = !source
      ? 'UNKNOWN'
      : fresh
        ? source.state
        : source.state === 'unknown' || source.state === 'not-measured'
          ? 'UNKNOWN'
          : 'stale / unavailable';
    return {
      label,
      source: id,
      value: fresh ? source.counts[field].value : null,
      state,
      timestamp: source?.sourceTimestamp ?? 'UNKNOWN',
    };
  });
}

export function ShippingStatistics() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ['ovie', 'shipping-state'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/hud/shipping-state', {
        signal,
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(
          `Shipping observation unavailable (${response.status})`
        );
      const data = parseShippingCockpitProjection(await response.json());
      if (!data) throw new Error('Shipping receipt could not be validated');
      return data;
    },
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const rows = pipelineRows(query.data, now);
  const current =
    query.data &&
    query.data.state === 'fresh' &&
    now <= Date.parse(query.data.freshnessDeadline) &&
    !query.isError;
  const meaning = (key: 'productionVerified' | 'exactLiveBuild') =>
    current && query.data?.meanings[key].state === 'measured'
      ? query.data.meanings[key].value
        ? 'Verified'
        : 'Not verified'
      : 'UNKNOWN';
  return (
    <div className='space-y-6 p-4'>
      <section aria-labelledby='shipping-pipeline-title'>
        <div className='flex items-center justify-between gap-3'>
          <h2
            id='shipping-pipeline-title'
            className='text-sm font-semibold text-primary-token line-clamp-2'
          >
            Current Pipeline
          </h2>
          <Button
            variant='secondary'
            size='sm'
            onClick={() => {
              void query.refetch();
            }}
            disabled={query.isFetching}
          >
            {query.isFetching ? 'Refreshing' : 'Refresh pipeline'}
          </Button>
        </div>
        <p role='status' className='min-h-12 py-2 text-xs text-secondary-token'>
          {query.isPending
            ? 'Loading pipeline observations…'
            : query.isError
              ? 'UNKNOWN — observation failed. Refresh to retry.'
              : `Observed ${query.data?.observationTimestamp ?? 'UNKNOWN'} · ${current ? 'Fresh' : 'Stale or partial'} · Counts are work items / pull requests.`}
        </p>
        <div className='overflow-x-auto'>
          <table className='w-full text-left text-xs tabular-nums'>
            <caption className='sr-only'>
              Current pipeline counts, source and observation freshness
            </caption>
            <thead>
              <tr>
                {['Stage', 'Count', 'Source', 'State', 'Source timestamp'].map(
                  label => (
                    <th
                      key={label}
                      scope='col'
                      className='p-2 whitespace-nowrap'
                    >
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.label} className='border-t border-subtle'>
                  <th scope='row' className='p-2 font-medium whitespace-nowrap'>
                    {row.label}
                  </th>
                  <td className='p-2'>
                    {query.isError ? 'UNKNOWN' : (row.value ?? 'UNKNOWN')}
                  </td>
                  <td className='p-2'>{row.source}</td>
                  <td className='p-2'>{row.state}</td>
                  <td className='p-2'>{row.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className='min-h-12 py-2 text-xs text-secondary-token'>
          Current bottleneck: UNKNOWN — these point-in-time counts do not
          establish a throughput limiter.
        </p>
      </section>
      <section
        className='border-y border-subtle'
        aria-label='Source Merge History'
      >
        <ShippingVelocityChart />
      </section>
      <section
        aria-labelledby='shipping-runtime-title'
        className='space-y-2 text-xs text-secondary-token'
      >
        <h2
          id='shipping-runtime-title'
          className='text-sm font-semibold text-primary-token line-clamp-2'
        >
          Deployment And Runtime
        </h2>
        <p>
          Production controller: {meaning('productionVerified')} · Exact live
          build: {meaning('exactLiveBuild')}
        </p>
        <p>
          Source: /api/hud/shipping-state · Observed:{' '}
          {query.data?.observationTimestamp ?? 'UNKNOWN'}
        </p>
        <p>
          Deployments over time: UNKNOWN · Verified runtime shipments over time:
          UNKNOWN. The existing receipt provides current verification, not a
          historical shipment count.
        </p>
      </section>
    </div>
  );
}

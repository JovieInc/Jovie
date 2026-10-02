import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { Suspense, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthFounderFunnel } from '@/app/app/(shell)/admin/growth/GrowthFounderFunnel';
import type {
  FounderFunnelData,
  FounderFunnelStageRows,
  FounderFunnelTimeRange,
} from '@/lib/admin/types';
import { FounderFunnelBand } from './FounderFunnelBand';
import { FounderFunnelDrilldown } from './FounderFunnelDrilldown';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const funnel: FounderFunnelData = {
  timeRange: '30d',
  biggestDropOffKey: 'accounts_created',
  errors: [],
  definitionVersion: 'founder-funnel.v2',
  stages: [
    {
      key: 'onboarding_chats',
      label: 'Onboarding chats',
      description: 'Started onboarding',
      count: 100,
      conversionRate: null,
      dropOff: null,
      identifiable: false,
      drillDownHref: null,
    },
    {
      key: 'accounts_created',
      label: 'Accounts created',
      description: 'Created an account',
      count: 40,
      conversionRate: 0.4,
      dropOff: 60,
      identifiable: true,
      drillDownHref:
        '/app/ov/growth?view=leads&funnelStage=accounts_created&funnelRange=30d',
    },
  ],
};

const initialParams =
  'view=leads&q=Ada&funnelStage=accounts_created&funnelRange=7d&tag=a&tag=b';

function ServerCohort({
  range,
  ready,
  params,
}: {
  range: FounderFunnelTimeRange;
  ready: { current: boolean; promise: Promise<void> };
  params: string;
}) {
  if (range === '30d' && !ready.current) throw ready.promise;
  const count = range === '7d' ? 7 : 30;
  const data: FounderFunnelData = {
    ...funnel,
    timeRange: range,
    stages: [{ ...funnel.stages[1], count }],
  };
  const rows: FounderFunnelStageRows = {
    stage: 'accounts_created',
    stageLabel: 'Accounts created',
    stageDescription: 'Created an account',
    timeRange: range,
    total: count,
    rows: [
      {
        id: range,
        displayName: `${range} customer`,
        email: null,
        enteredAt: null,
      },
    ],
    errors: [],
    limit: 100,
    definitionVersion: 'founder-funnel.v2',
  };
  return (
    <>
      <GrowthFounderFunnel initialFunnel={data} urlSearchParams={params} />
      <FounderFunnelDrilldown result={rows} urlSearchParams={params} />
    </>
  );
}

function RangeNavigationFixture({
  ready,
  onUrlUpdate,
}: {
  ready: { current: boolean; promise: Promise<void> };
  onUrlUpdate: (event: {
    searchParams: URLSearchParams;
    options: unknown;
  }) => void;
}) {
  const [params, setParams] = useState(initialParams);
  return (
    <NuqsTestingAdapter
      searchParams={initialParams}
      hasMemory
      onUrlUpdate={event => {
        onUrlUpdate(event);
        setParams(event.searchParams.toString());
      }}
    >
      <Suspense fallback={<div>Replacing cohort</div>}>
        <ServerCohort
          range={
            (new URLSearchParams(params).get('funnelRange') ??
              '30d') as FounderFunnelTimeRange
          }
          ready={ready}
          params={params}
        />
      </Suspense>
    </NuqsTestingAdapter>
  );
}

describe('FounderFunnelBand', () => {
  it('links identifiable funnel stages to their entity drill-down', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <FounderFunnelBand initialFunnel={funnel} />
      </QueryClientProvider>
    );

    expect(
      screen.getByRole('link', {
        name: '40 Accounts created; inspect underlying entities',
      })
    ).toHaveAttribute(
      'href',
      '/app/ov/growth?view=leads&funnelStage=accounts_created&funnelRange=30d'
    );
  });

  it('does not link anonymous aggregate-only stages', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <FounderFunnelBand initialFunnel={funnel} />
      </QueryClientProvider>
    );

    expect(
      screen.queryByRole('link', { name: /Onboarding chats/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Anonymous · aggregate only')).toBeInTheDocument();
  });
  it('changes an open drill-down and aggregate together while preserving the displayed cohort and focus', async () => {
    let release!: () => void;
    const ready = {
      current: false,
      promise: new Promise<void>(resolve => {
        release = resolve;
      }),
    };
    const onUrlUpdate = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <RangeNavigationFixture ready={ready} onUrlUpdate={onUrlUpdate} />
      </QueryClientProvider>
    );
    const nextTab = screen.getByRole('tab', { name: '30d' });
    await user.click(nextTab);
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledOnce());
    const event = onUrlUpdate.mock.calls[0][0];
    expect(event.options).toMatchObject({
      shallow: false,
      history: 'push',
      scroll: false,
    });
    expect(event.searchParams.get('funnelRange')).toBe('30d');
    expect(event.searchParams.get('funnelStage')).toBe('accounts_created');
    expect(event.searchParams.get('q')).toBe('Ada');
    expect(event.searchParams.getAll('tag')).toEqual(['a', 'b']);
    expect(screen.getByRole('tab', { name: '7d' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(nextTab).toHaveFocus();
    expect(screen.getByText('7d customer')).toBeInTheDocument();
    expect(screen.getByText('Updating funnel range…')).toBeInTheDocument();
    const oldLink = screen.getByRole('link', {
      name: '7 Accounts created; inspect underlying entities',
    });
    expect(
      new URL(oldLink.getAttribute('href')!, 'https://jov.ie').searchParams.get(
        'funnelRange'
      )
    ).toBe('7d');
    expect(oldLink.closest('ul')?.parentElement).toHaveClass('min-h-20');
    await act(async () => {
      ready.current = true;
      release();
      await ready.promise;
    });
    expect(screen.getByRole('tab', { name: '30d' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(nextTab).toHaveFocus();
    expect(screen.getByText('30d customer')).toBeInTheDocument();
    expect(screen.queryByText('7d customer')).not.toBeInTheDocument();
    const stage = screen.getByRole('link', {
      name: '30 Accounts created; inspect underlying entities',
    });
    const href = new URL(stage.getAttribute('href')!, 'https://jov.ie')
      .searchParams;
    expect(href.get('funnelRange')).toBe('30d');
    expect(href.get('q')).toBe('Ada');
    expect(href.getAll('tag')).toEqual(['a', 'b']);
    const back = new URL(
      screen
        .getByRole('link', { name: 'Clear drill-down' })
        .getAttribute('href')!,
      'https://jov.ie'
    ).searchParams;
    expect(back.has('funnelStage')).toBe(false);
    expect(back.get('funnelRange')).toBe('30d');
    expect(back.get('q')).toBe('Ada');
    expect(back.getAll('tag')).toEqual(['a', 'b']);
    client.clear();
  });
});

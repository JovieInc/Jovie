import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bottleneckFixture } from '@/lib/ovie/pipeline-bottleneck.fixtures';
import { queryKeys } from '@/lib/queries/keys';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PipelineBottleneckBanner } from './PipelineBottleneckBanner';

const key = queryKeys.hud.pipelineBottleneck();

function mount(
  data: ReturnType<typeof bottleneckFixture> | null,
  { isAdmin = true, dir }: { isAdmin?: boolean; dir?: 'rtl' } = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(key, data);
  return render(
    <QueryClientProvider client={client}>
      <div dir={dir}>
        <PipelineBottleneckBanner isAdmin={isAdmin} />
      </div>
    </QueryClientProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('PipelineBottleneckBanner certificate', () => {
  it('moves keyboard focus to the inspect link of the active bottleneck', async () => {
    const user = userEvent.setup();
    const { container } = mount(bottleneckFixture());

    await user.tab();
    const link = screen.getByRole('link', { name: 'Inspect Runner capacity' });
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/JovieInc/Jovie/pull/17005'
    );
    expect(screen.getByLabelText('Pipeline Bottleneck')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reports a clear pipeline as the empty state', async () => {
    const { container } = mount(
      bottleneckFixture({ status: 'clear', rank1: null })
    );

    expect(screen.getByText('No current bottleneck')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays quiet when the read fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client
      .getQueryCache()
      .build(client, { queryKey: key })
      .setState({ status: 'error', error: new Error('Read failed') });
    const { container } = render(
      <QueryClientProvider client={client}>
        <PipelineBottleneckBanner isAdmin />
      </QueryClientProvider>
    );

    expect(
      screen.queryByLabelText('Pipeline Bottleneck')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('No current bottleneck')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('hides the banner from non-admins', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = mount(bottleneckFixture(), { isAdmin: false });

    expect(screen.queryByText('Agentic')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('truncates a long cause, cost and impact', async () => {
    const oneLine =
      'Runner memory is limiting concurrent repairs across every shard, so qualified repairs wait in the queue for more than an hour.';
    const { container } = mount(
      bottleneckFixture({
        status: 'needs-you',
        rank1: { id: 'runner-memory', title: 'Runner memory', oneLine },
        metric: undefined,
        cost: {
          item: 'Runner memory upgrade for every shard',
          monthlyUsd: 240,
        },
        impact: 'Adds capacity for twelve concurrent repairs.',
      })
    );

    expect(screen.getByText(oneLine)).toHaveClass('truncate');
    expect(
      screen.getByText('$240/mo · Runner memory upgrade for every shard')
    ).toHaveClass('truncate');
    expect(
      screen.getByText('Adds capacity for twelve concurrent repairs.')
    ).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with Arabic copy in a right-to-left document', async () => {
    const { container } = mount(
      bottleneckFixture({
        rank1: {
          id: 'runner-capacity',
          title: 'سعة المشغل',
          oneLine: 'الإصلاحات المؤهلة تنتظر سعة المشغل.',
        },
        metric: undefined,
      }),
      { dir: 'rtl' }
    );

    expect(
      screen.getByText('الإصلاحات المؤهلة تنتظر سعة المشغل.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Inspect سعة المشغل' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

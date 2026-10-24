import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PIPELINE_BOTTLENECK_MAX_AGE_MS } from '@/lib/ovie/pipeline-bottleneck';
import {
  bottleneckFixture,
  contributionFixture,
} from '@/lib/ovie/pipeline-bottleneck.fixtures';
import { queryKeys } from '@/lib/queries/keys';
import { PipelineBottleneckBanner } from './PipelineBottleneckBanner';

const key = queryKeys.hud.pipelineBottleneck();
function mount(
  data: ReturnType<typeof bottleneckFixture> | null,
  isAdmin = true
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(key, data);
  const result = render(
    <QueryClientProvider client={client}>
      <PipelineBottleneckBanner isAdmin={isAdmin} />
    </QueryClientProvider>
  );
  return { ...result, client };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PipelineBottleneckBanner', () => {
  it('shows the active repair line and agentic badge', () => {
    mount(bottleneckFixture());
    expect(screen.getByText('Agentic')).toBeInTheDocument();
    expect(screen.getByText('Agents on it')).toBeInTheDocument();
    expect(
      screen.getByText(bottleneckFixture().rank1!.oneLine)
    ).toBeInTheDocument();
  });

  it('shows an actionable cost and impact for needs-you, including zero-cost credential changes', async () => {
    const loop = contributionFixture();
    const { client } = mount(
      bottleneckFixture({
        status: 'needs-you',
        cost: loop.cost!,
        impact: loop.impact!,
      })
    );
    expect(screen.getByText('Needs you')).toBeInTheDocument();
    expect(screen.getByText('$24/mo · Runner memory')).toBeInTheDocument();
    expect(screen.getByText(loop.impact!)).toBeInTheDocument();
    act(() => {
      client.setQueryData(
        key,
        bottleneckFixture({
          status: 'needs-you',
          cost: { item: 'Credential access', monthlyUsd: 0 },
          impact: 'Restores provider access.',
        })
      );
    });
    await screen.findByText('$0/mo · Credential access');
  });

  it('quietly reports clear and hides missing, stale, future, or non-admin data', async () => {
    const { client, rerender } = mount(
      bottleneckFixture({ status: 'clear', rank1: null })
    );
    expect(screen.getByText('No current bottleneck')).toBeInTheDocument();
    for (const data of [
      null,
      bottleneckFixture({ observedAt: '2020-01-01T00:00:00Z' }),
      bottleneckFixture({ observedAt: '2099-01-01T00:00:00Z' }),
    ]) {
      await act(async () => {
        client.setQueryData(key, data);
      });
      await waitFor(() =>
        expect(
          screen.queryByText('No current bottleneck')
        ).not.toBeInTheDocument()
      );
      expect(
        screen.queryByLabelText('Pipeline Bottleneck')
      ).not.toBeInTheDocument();
    }
    act(() => {
      client.setQueryData(key, bottleneckFixture());
    });
    rerender(
      <QueryClientProvider client={client}>
        <PipelineBottleneckBanner isAdmin={false} />
      </QueryClientProvider>
    );
    expect(
      screen.queryByLabelText('Pipeline Bottleneck')
    ).not.toBeInTheDocument();
  });

  it('expires displayed data while an idle tab remains open', () => {
    vi.useFakeTimers();
    const observedAt = new Date(
      Date.now() - PIPELINE_BOTTLENECK_MAX_AGE_MS + 100
    ).toISOString();
    mount(bottleneckFixture({ observedAt }));
    expect(screen.getByText('Agentic')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(101);
    });
    expect(screen.queryByText('Agentic')).not.toBeInTheDocument();
  });

  it('does not request data for non-admins, including with a warm admin cache', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mount(bottleneckFixture(), false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Agentic')).not.toBeInTheDocument();
  });

  it('loads through the real query hook and renders nothing while loading or on failure', async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>(done => {
          resolve = done;
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const { client } = mount(null);
    act(() => {
      void client.invalidateQueries({ queryKey: key });
    });
    expect(
      screen.queryByLabelText('Pipeline Bottleneck')
    ).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      resolve(new Response(JSON.stringify(bottleneckFixture())));
    });
    await screen.findByText('Agentic');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/internal/ovie/pipeline-bottleneck',
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      })
    );
    fetchMock.mockRejectedValue(new Error('Offline'));
    await act(async () => {
      await client.refetchQueries({ queryKey: key });
    });
    await waitFor(() =>
      expect(screen.queryByText('Agentic')).not.toBeInTheDocument()
    );
  });
});

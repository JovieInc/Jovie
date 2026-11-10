import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { unknownProjection } from '@/lib/ovie/shipping-state/project';
import { ShippingStatistics } from './ShippingStatistics';

vi.mock('@/components/features/admin/ShippingVelocityChart', () => ({
  ShippingVelocityChart: () => null,
}));

afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
  vi.restoreAllMocks();
});

describe('ShippingStatistics interactions', () => {
  it('keeps the five pipeline rows mounted with skeletons until the first observation arrives', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {})
    );
    const client = new QueryClient();
    const view = render(
      <QueryClientProvider client={client}>
        <ShippingStatistics />
      </QueryClientProvider>
    );
    expect(screen.getAllByRole('row')).toHaveLength(6);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.queryByText(/UNKNOWN/)).not.toBeInTheDocument();
    expect(
      view.container.querySelectorAll('[data-slot="skeleton"]').length
    ).toBeGreaterThanOrEqual(15);
    view.unmount();
    client.clear();
  });

  it('only refreshes on explicit refresh after resizing and focus changes', async () => {
    const receipt = unknownProjection({
      sequence: 1,
      observationTimestamp: new Date().toISOString(),
      emissionTimestamp: new Date().toISOString(),
      latencyMs: 1,
      publishing: true,
      lastError: null,
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify(receipt)));
    const client = new QueryClient();
    const view = render(
      <QueryClientProvider client={client}>
        <ShippingStatistics />
      </QueryClientProvider>
    );
    await screen.findByText(/Observed .*Stale or partial/);
    await act(async () => {
      fireEvent(globalThis.window, new Event('resize'));
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('row')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh pipeline' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    view.unmount();
    client.clear();
  });
});

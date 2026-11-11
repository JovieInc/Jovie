import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OvieShippingStateCard } from '@/components/features/admin/hud/OvieShippingStateCard';
import { resetHudShippingStateForTests } from '@/components/features/admin/hud/useHudShippingStateQuery';
import { SHIPPING_STATE_REQUEST_TIMEOUT_MS } from '@/lib/ovie/shipping-state-client';

const fetchMock = vi.fn();
const NOW = new Date('2026-11-09T12:00:00Z');
function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
afterEach(() => {
  resetHudShippingStateForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('shipping read deadline', () => {
  it('times out a hung read without inventing a measurement', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    fetchMock.mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <OvieShippingStateCard />
      </QueryClientProvider>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SHIPPING_STATE_REQUEST_TIMEOUT_MS);
      await vi.advanceTimersByTimeAsync(0);
    });

    const panel = screen.getByTestId('hud-shipper-status-panel');
    await vi.waitFor(() =>
      expect(panel).toHaveAttribute('data-truth', 'unavailable')
    );
    expect(panel).toHaveAttribute('data-connection', 'disconnected');
    expect(screen.getByText('Shipping-state request timed out')).toBeTruthy();
    expect(screen.getAllByText(/^Unknown/).length).toBeGreaterThan(0);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('times out a stalled response body after headers arrive', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    fetchMock.mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve({
          status: 200,
          ok: true,
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }),
        } as Response)
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <OvieShippingStateCard />
      </QueryClientProvider>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SHIPPING_STATE_REQUEST_TIMEOUT_MS);
      await vi.advanceTimersByTimeAsync(0);
    });

    const panel = screen.getByTestId('hud-shipper-status-panel');
    await vi.waitFor(() =>
      expect(panel).toHaveAttribute('data-truth', 'unavailable')
    );
    expect(panel).toHaveAttribute('data-connection', 'disconnected');
    expect(screen.getByText('Shipping-state request timed out')).toBeTruthy();
    expect(screen.getAllByText(/^Unknown/).length).toBeGreaterThan(0);
    expect(screen.queryByText('0')).toBeNull();
  });
});

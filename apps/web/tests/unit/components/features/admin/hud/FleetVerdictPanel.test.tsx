import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FleetVerdictPanel } from '@/components/features/admin/hud/FleetVerdictPanel';

const unmeasured = { schema: 'ovie.shipping-state.v1', state: 'unknown' };

describe('FleetVerdictPanel', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('polls the shipping read so a cold "not measured" answer can heal', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => unmeasured,
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <FleetVerdictPanel />
      </QueryClientProvider>
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(31_000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(screen.getByTestId('fleet-verdict-panel')).toBeTruthy();
    client.clear();
  });
});

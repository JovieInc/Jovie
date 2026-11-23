import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshShippingProjection } from '@/tests/e2e/utils/admin-visual-shipping-fixture';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OvieShippingStateCard } from './OvieShippingStateCard';
import { resetHudShippingStateForTests } from './useHudShippingStateQuery';

function projection(overrides: Record<string, unknown> = {}) {
  return { ...freshShippingProjection(), ...overrides };
}

const fetchMock = vi.fn();

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OvieShippingStateCard />
    </QueryClientProvider>
  );
}

const panel = () => screen.getByTestId('hud-shipper-status-panel');

describe('OvieShippingStateCard (colocated)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    resetHudShippingStateForTests();
    vi.unstubAllGlobals();
  });

  it('is an axe-clean status region while the first poll is pending', async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    const { container } = renderCard();

    expect(panel()).toHaveAttribute('role', 'status');
    expect(panel()).toHaveAttribute('aria-label', 'Ubuntu Shipping State');
    expect(panel()).toHaveAttribute('data-truth', 'unknown');
    expect(screen.getByTestId('hud-shipping-truth')).toHaveTextContent(
      'Syncing'
    );
    expect(
      screen.getByTestId('hud-delivery-metrics-syncing')
    ).toHaveTextContent('Some signals are still syncing.');
    await expectNoA11yViolations(container);
  });

  it('renders a fresh read with its alerts and source line, axe-clean', async () => {
    fetchMock.mockImplementation(async () => Response.json(projection()));
    const { container } = renderCard();

    await waitFor(() => expect(panel()).toHaveAttribute('data-truth', 'fresh'));
    expect(screen.getByText('Fresh')).toBeInTheDocument();
    expect(panel()).toHaveAttribute('data-revision', 'rev-4');
    expect(screen.getByTestId('hud-delivery-metrics')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows Unauthorized without inventing zeros, axe-clean', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const { container } = renderCard();

    await waitFor(() =>
      expect(panel()).toHaveAttribute('data-truth', 'unauthorized')
    );
    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    const metrics = screen.queryByTestId('hud-delivery-metrics');
    expect(
      metrics?.querySelectorAll('[data-measured="unknown"]').length ?? 0
    ).toBe(0);
    expect(
      screen.getByTestId('hud-delivery-metrics-syncing')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reads as disconnected when the poll cannot be sent, axe-clean', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = renderCard();

    await waitFor(() =>
      expect(panel()).toHaveAttribute('data-connection', 'disconnected')
    );
    await expectNoA11yViolations(container);
  });

  it('marks a partial read degraded and shows the source error, axe-clean', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        projection({
          state: 'partial',
          lastError: {
            at: new Date().toISOString(),
            code: 'unavailable',
            message: 'GitHub GraphQL returned 502',
          },
        })
      )
    );
    const { container } = renderCard();

    await waitFor(() =>
      expect(panel()).toHaveAttribute('data-truth', 'degraded')
    );
    expect(
      screen.getByTestId('hud-delivery-metrics-syncing')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('polls again when the window regains focus or the tab becomes visible', async () => {
    fetchMock.mockImplementation(async () => Response.json(projection()));
    renderCard();
    await waitFor(() => expect(panel()).toHaveAttribute('data-truth', 'fresh'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const initialPageShow = new Event('pageshow');
    Object.defineProperty(initialPageShow, 'persisted', { value: false });
    fireEvent(window, initialPageShow);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

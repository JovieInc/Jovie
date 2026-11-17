import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OvieHomeCanvas } from './OvieHomeCanvas';
import {
  COMPANY_RESPONSES,
  INBOX,
  snapshot,
} from './OvieHomeCanvas.test-fixtures';

vi.mock('@/components/feedback', () => ({
  toast: Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));
vi.mock('./useOvieHomeReadyTiming', () => ({
  useOvieHomeReadyTiming: vi.fn(),
}));
vi.mock('@/lib/ovie/home/panel-alerts', () => ({
  reportOvieHomePanelError: vi.fn(),
}));

const shipping = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('./useHudShippingStateQuery', () => ({
  useHudShippingStateQuery: () =>
    shipping.data
      ? {
          ...(shipping.data as object),
          isPending: false,
          isFetching: false,
          refetch: vi.fn(),
        }
      : { isPending: true, isFetching: true, refetch: vi.fn() },
}));

function renderCanvas() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OvieHomeCanvas />
    </QueryClientProvider>
  );
}

describe('OvieHomeCanvas certificate', () => {
  const fetchMock = vi.fn();
  let responses: Record<string, unknown>;

  beforeEach(() => {
    shipping.data = snapshot();
    responses = { ...COMPANY_RESPONSES, '/api/ovie/inbox': INBOX };
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      url in responses
        ? new Response(JSON.stringify(responses[url]), { status: 200 })
        : new Response('unavailable', { status: 503 })
    );
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is axe-clean while every section is loading', async () => {
    shipping.data = undefined;
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    const { container } = renderCanvas();

    expect(screen.queryByText('Vercel on-demand concurrency')).toBeNull();
    expect(screen.getByTestId('home-loop-pulse')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean with asks, shipping rows and company tiles loaded', async () => {
    const { container } = renderCanvas();

    expect(
      await screen.findByText('Vercel on-demand concurrency')
    ).toBeVisible();
    expect(
      await screen.findByTestId('home-loop-tile-runway')
    ).toHaveTextContent('6 days');
    expect(screen.getByTestId('home-loop-done')).toHaveTextContent('3 merges');
    await expectNoA11yViolations(container);
  });

  it('is axe-clean with an empty inbox', async () => {
    responses['/api/ovie/inbox'] = { cases: [], issues: [] };
    const { container } = renderCanvas();

    expect(
      await screen.findByText('Nothing needs your decision.')
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean when decisions cannot load', async () => {
    delete responses['/api/ovie/inbox'];
    const { container } = renderCanvas();

    expect(await screen.findByText('Decisions could not load.')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean when an inbox source is missing', async () => {
    responses['/api/ovie/inbox'] = {
      ...INBOX,
      issues: ['Requested work is unavailable.'],
    };
    const { container } = renderCanvas();

    expect(
      await screen.findByText('Vercel on-demand concurrency')
    ).toBeVisible();
    expect(container).toHaveTextContent(/unavailable|source/i);
    await expectNoA11yViolations(container);
  });
});

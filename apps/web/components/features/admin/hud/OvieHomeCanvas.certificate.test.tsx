import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OvieHomeCanvas } from './OvieHomeCanvas';
import { COMPANY_RESPONSES, snapshot } from './OvieHomeCanvas.test-fixtures';

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
    responses = { ...COMPANY_RESPONSES };
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      url in responses
        ? new Response(JSON.stringify(responses[url]), { status: 200 })
        : new Response('unavailable', { status: 503 })
    );
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is axe-clean while Story First is loading', async () => {
    shipping.data = undefined;
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    const { container } = renderCanvas();

    expect(screen.getByTestId('story-first-canvas')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean with bottleneck, glance, and stages loaded', async () => {
    const { container } = renderCanvas();

    expect(await screen.findByTestId('story-first-bottleneck')).toBeVisible();
    expect(await screen.findByTestId('story-first-stages')).toBeInTheDocument();
    expect(
      await screen.findByTestId('story-first-glance-shipping')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean when company glance sources fail', async () => {
    responses = {
      '/api/ovie/home/blocker': COMPANY_RESPONSES['/api/ovie/home/blocker'],
    };
    const { container } = renderCanvas();

    expect(await screen.findByTestId('story-first-canvas')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});

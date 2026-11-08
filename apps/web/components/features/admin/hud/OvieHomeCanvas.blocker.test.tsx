import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
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
const panelAlert = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ovie/home/panel-alerts', () => ({
  reportOvieHomePanelError: panelAlert,
}));
vi.mock('./useHudShippingStateQuery', () => ({
  useHudShippingStateQuery: () => ({
    ...snapshot(),
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

const BLOCKED = {
  generatedAt: '2026-11-08T23:00:00.000Z',
  blocker: {
    schema: 'jovie.company-blocker/v1',
    id: 'certification:public_profile',
    kind: 'certification',
    step: 'public_profile',
    tone: 'bad',
    text: 'The public profile fails certification, so no artist can be sent their profile yet',
    detailsHref: APP_ROUTES.ADMIN_CERTIFICATIONS,
    since: null,
    nextAction: null,
    observedAt: '2026-11-08T23:00:00.000Z',
  },
};

describe('OvieHomeCanvas revenue blocker', () => {
  const fetchMock = vi.fn();
  let responses: Record<string, unknown>;

  beforeEach(() => {
    panelAlert.mockReset();
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

  function renderCanvas() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <OvieHomeCanvas />
      </QueryClientProvider>
    );
    return screen.getByTestId('home-loop-constraint');
  }

  it('leads the banner with the revenue blocker over shipping health', async () => {
    responses['/api/ovie/home/blocker'] = BLOCKED;
    const banner = renderCanvas();
    await waitFor(() => expect(banner).toHaveTextContent(BLOCKED.blocker.text));
    expect(banner).toHaveAttribute('data-tone', 'bad');
    expect(
      within(banner).getByRole('link', { name: 'Details' })
    ).toHaveAttribute('href', APP_ROUTES.ADMIN_CERTIFICATIONS);
  });

  it('drops the shipping all-clear once revenue reads clear', async () => {
    const banner = renderCanvas();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/ovie/home/blocker',
        expect.anything()
      )
    );
    await waitFor(() =>
      expect(banner).not.toHaveTextContent('Shipping is on target')
    );
    expect(panelAlert).not.toHaveBeenCalledWith(
      'revenue-blocker',
      expect.anything()
    );
  });

  it('reports an unreadable blocker and never says revenue is clear', async () => {
    delete responses['/api/ovie/home/blocker'];
    const banner = renderCanvas();
    await waitFor(() =>
      expect(panelAlert).toHaveBeenCalledWith(
        'revenue-blocker',
        'company-state-unavailable'
      )
    );
    expect(banner).not.toHaveTextContent('Nothing is blocking revenue');
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
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

describe('OvieHomeCanvas revenue blocker (Story First)', () => {
  const fetchMock = vi.fn();
  let responses: Record<string, unknown>;

  beforeEach(() => {
    panelAlert.mockReset();
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

  function renderCanvas() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <OvieHomeCanvas />
      </QueryClientProvider>
    );
    return screen.getByTestId('story-first-bottleneck');
  }

  it('leads the Story First hero with the revenue blocker', async () => {
    responses['/api/ovie/home/blocker'] = BLOCKED;
    const hero = renderCanvas();
    await waitFor(() =>
      expect(hero).toHaveTextContent('The public profile is blocking revenue')
    );
    expect(hero).toHaveAttribute('data-tone', 'bad');
    expect(hero).toHaveTextContent(BLOCKED.blocker.text);
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute(
      'href',
      APP_ROUTES.ADMIN_CERTIFICATIONS
    );
  });

  it('reads clear once revenue is clear even if shipping had a prior floor', async () => {
    const hero = renderCanvas();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/ovie/home/blocker',
        expect.anything()
      )
    );
    // Fixture blocker is null; shipping still has a blocked task so the
    // floor may name shipping — never invents "nothing is blocking revenue"
    // while shipping is off target.
    await waitFor(() =>
      expect(hero).not.toHaveAttribute('data-tone', 'loading')
    );
    expect(hero.getAttribute('data-tone')).not.toBe('loading');
  });

  it('alerts when the revenue blocker cannot be read', async () => {
    delete responses['/api/ovie/home/blocker'];
    renderCanvas();
    await waitFor(() =>
      expect(panelAlert).toHaveBeenCalledWith(
        'revenue-blocker',
        'company-state-unavailable'
      )
    );
  });
});

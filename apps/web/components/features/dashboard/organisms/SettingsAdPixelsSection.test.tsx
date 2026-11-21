import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries/keys';
import type { PixelHealthData } from '@/lib/queries/usePixelHealthQuery';
import type { PixelSettingsData } from '@/lib/queries/usePixelSettingsQuery';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsAdPixelsSection } from './SettingsAdPixelsSection';

vi.mock('@/features/dashboard/molecules/SettingsToggleRow', () => ({
  SettingsToggleRow: ({ title }: { readonly title: string }) => <p>{title}</p>,
}));

const settings: PixelSettingsData = {
  pixels: {
    facebookPixelId: '1234567890123456',
    googleMeasurementId: 'G-ABCDE12345',
    tiktokPixelId: null,
    enabled: true,
    facebookEnabled: true,
    googleEnabled: true,
    tiktokEnabled: false,
  },
  hasTokens: { facebook: true, google: true, tiktok: false },
};

const health: PixelHealthData = {
  platforms: {
    facebook: {
      status: 'healthy',
      totalSent: 10,
      totalFailed: 0,
      lastSuccessAt: '2026-09-27T00:00:00.000Z',
    },
    google: {
      status: 'degraded',
      totalSent: 10,
      totalFailed: 5,
      lastSuccessAt: '2026-09-27T00:00:00.000Z',
    },
    tiktok: {
      status: 'inactive',
      totalSent: 0,
      totalFailed: 0,
      lastSuccessAt: null,
    },
  },
  aggregate: { totalEventsThisWeek: 20, overallSuccessRate: 75 },
};

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  client.setQueryData(queryKeys.pixels.settings(), settings);
  client.setQueryData(queryKeys.pixels.health(), health);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('SettingsAdPixelsSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the gated panel on a free plan', async () => {
    const { container } = render(
      wrap(<SettingsAdPixelsSection isPro={false} />)
    );
    expect(screen.getByText('Enable pixel tracking')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('colours platform health with status tokens', async () => {
    const { container } = render(wrap(<SettingsAdPixelsSection />));
    expect(await screen.findByText('Healthy')).toHaveClass('text-success');
    expect(screen.getByText('Degraded')).toHaveClass('text-warning');
    await expectNoA11yViolations(container);
  });

  it('reveals and hides a token with its toggle', async () => {
    const user = userEvent.setup();
    render(wrap(<SettingsAdPixelsSection />));

    const toggle = (
      await screen.findAllByRole('button', { name: /token|secret/i })
    )[0];
    const input = document.getElementById(
      toggle.getAttribute('aria-controls') ?? ''
    ) as HTMLInputElement;
    expect(input.type).toBe('password');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(input.type).toBe('text');
    await user.click(toggle);
    expect(input.type).toBe('password');
  });

  it('keeps typed text across a re-render and saves the change', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const view = render(wrap(<SettingsAdPixelsSection />));

    const pixelId = (await screen.findByLabelText(
      'Pixel Code'
    )) as HTMLInputElement;
    await user.type(pixelId, 'CABC123');
    expect(pixelId).toHaveValue('CABC123');
    view.rerender(wrap(<SettingsAdPixelsSection />));
    expect(screen.getByLabelText('Pixel Code')).toHaveValue('CABC123');

    const save = screen.getByRole('button', { name: 'Save Pixel Settings' });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/dashboard/pixels',
        expect.objectContaining({ method: 'PUT' })
      )
    );
  });

  it('tests a configured platform and shows the result', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true }), { status: 200 })
      )
    );
    render(wrap(<SettingsAdPixelsSection />));

    const tests = await screen.findAllByRole('button', { name: 'Test' });
    await user.click(tests[0]);
    expect(await screen.findByText('Event received')).toBeVisible();
  });
});

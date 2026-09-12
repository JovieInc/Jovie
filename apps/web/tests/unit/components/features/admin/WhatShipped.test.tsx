import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhatShipped } from '../../../../../components/features/admin/WhatShipped';

function renderWhatShipped() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  function Wrapper({ children }: Readonly<PropsWithChildren>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  return render(<WhatShipped />, { wrapper: Wrapper });
}

describe('WhatShipped', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders shipped rows with PR number and relative time', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: '2026-07-03T10:05:34.770172+00:00',
          available: true,
          items: [
            {
              number: 12875,
              title: 'Updated entity chip thumbnails to a new design',
              merged_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
              url: 'https://github.com/JovieInc/Jovie/pull/12875',
            },
          ],
        }),
        { status: 200 }
      )
    );

    renderWhatShipped();

    await waitFor(() => {
      expect(
        screen.getByText('Updated entity chip thumbnails to a new design')
      ).toBeInTheDocument();
    });

    expect(screen.getByText('#12875')).toBeInTheDocument();
    expect(screen.getByTestId('what-shipped-card')).toBeInTheDocument();
  });

  it('shows the empty state when a successful observation returns no items', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: '2026-07-03T10:05:34.770172+00:00',
          available: true,
          observation: 'empty',
          items: [],
        }),
        { status: 200 }
      )
    );

    renderWhatShipped();

    await waitFor(() => {
      expect(
        screen.getByText('Nothing shipped in the last few hours.')
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId('what-shipped-observation')).toHaveAttribute(
      'data-state',
      'empty'
    );
  });

  it('shows not configured when the source is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: null,
          available: false,
          observation: 'not_configured',
          items: [],
          errorMessage: 'What shipped source is not configured.',
        }),
        { status: 200 }
      )
    );

    renderWhatShipped();

    await waitFor(() => {
      expect(screen.getByTestId('what-shipped-observation')).toHaveAttribute(
        'data-state',
        'not_configured'
      );
    });
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument();
  });

  it('distinguishes unavailable from empty and exposes retry', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('upstream failed', { status: 503 })
    );

    renderWhatShipped();

    await waitFor(() => {
      expect(screen.getByTestId('what-shipped-observation')).toHaveAttribute(
        'data-state',
        'unavailable'
      );
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

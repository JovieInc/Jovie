import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhatShipped } from '@/components/features/admin/WhatShipped';

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
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

    renderWithQuery(<WhatShipped />);

    await waitFor(() => {
      expect(
        screen.getByText('Updated entity chip thumbnails to a new design')
      ).toBeInTheDocument();
    });

    expect(screen.getByText('#12875')).toBeInTheDocument();
    expect(screen.getByTestId('what-shipped-card')).toBeInTheDocument();
  });

  it('shows the empty state when no items are available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: null,
          available: false,
          items: [],
        }),
        { status: 200 }
      )
    );

    renderWithQuery(<WhatShipped />);

    await waitFor(() => {
      expect(
        screen.getByText('nothing shipped in the last few hours')
      ).toBeInTheDocument();
    });
  });
});
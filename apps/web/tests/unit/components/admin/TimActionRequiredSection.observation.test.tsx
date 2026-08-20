import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimActionRequiredSection } from '@/components/features/admin/TimActionRequiredSection';

describe('TimActionRequiredSection observation states', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows empty after a successful observation with no issues', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          issues: [],
          fetchedAt: new Date().toISOString(),
          available: true,
          observation: 'empty',
          errorMessage: null,
        }),
        { status: 200 }
      )
    );

    render(<TimActionRequiredSection />);

    await waitFor(() => {
      expect(screen.getByTestId('tim-action-observation')).toHaveAttribute(
        'data-state',
        'empty'
      );
    });
    expect(screen.getByText('Nothing needs Tim.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument();
  });

  it('shows not configured without retry when Linear is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          issues: [],
          fetchedAt: new Date().toISOString(),
          available: false,
          observation: 'not_configured',
          errorMessage: 'LINEAR_API_KEY is not configured.',
        }),
        { status: 200 }
      )
    );

    render(<TimActionRequiredSection />);

    await waitFor(() => {
      expect(screen.getByTestId('tim-action-observation')).toHaveAttribute(
        'data-state',
        'not_configured'
      );
    });
    expect(
      screen.getByText('LINEAR_API_KEY is not configured.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument();
  });

  it('shows unavailable with retry when Linear fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('linear down', { status: 503 })
    );

    render(<TimActionRequiredSection />);

    await waitFor(() => {
      expect(screen.getByTestId('tim-action-observation')).toHaveAttribute(
        'data-state',
        'unavailable'
      );
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

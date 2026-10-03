import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimActionRequiredSection } from '@/components/features/admin/TimActionRequiredSection';

vi.mock('@/lib/queries/useOvieCertificationsQuery', () => ({
  useOvieCertificationsQuery: () => ({
    data: {
      contract: 'jovie.ovie-certification-inventory/v1',
      generatedAt: '2026-09-27T00:00:00.000Z',
      universal: false,
      domains: [
        {
          domain: 'flows',
          label: 'Flows',
          status: 'connected',
          rowCount: 0,
          note: null,
        },
      ],
      counts: {
        working: 0,
        review_ready: 0,
        founder_locked: 0,
        shipped: 0,
        monitored: 0,
        total: 0,
      },
      queue: {
        contract: 'jovie.certification-inbox/v1',
        needsYou: [],
        blocked: [],
        stale: [],
        returned: [],
        certified: [],
        superseded: [],
      },
      rows: [],
      issues: [],
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useOvieCertificationDecisionMutation: () => ({ mutateAsync: vi.fn() }),
  getCertificationDecisionErrorMessage: () =>
    'The decision could not be recorded. Try again.',
}));

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
    expect(screen.getByText('Nothing needs you.')).toBeInTheDocument();
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

  it('says admin data is locked when the step-up lock returns 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"Forbidden"}', { status: 403 })
    );

    render(<TimActionRequiredSection />);

    expect(
      await screen.findByText(
        'Admin data is locked. Unlock with Touch ID, then retry.'
      )
    ).toBeInTheDocument();
  });
});

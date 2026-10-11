import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimActionRequiredSection } from './TimActionRequiredSection';

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

describe('TimActionRequiredSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('labels founder decisions as Needs You', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          issues: [],
          fetchedAt: '2026-09-27T00:00:00.000Z',
          available: true,
          observation: 'empty',
          errorMessage: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    render(<TimActionRequiredSection />);

    expect(await screen.findByText('Needs You')).toBeInTheDocument();
    expect(screen.getByText('Nothing needs you.')).toBeInTheDocument();
    expect(screen.queryByText('Needs Tim')).not.toBeInTheDocument();
  });

  it('uses the existing page heading and flat rows for the standalone route', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          issues: [
            {
              id: 'decision-1',
              identifier: 'JOV-1',
              title: 'Review release',
              url: 'https://linear.app/jovie/issue/JOV-1',
              priority: 2,
              daysOld: 1,
            },
          ],
          available: true,
          observation: 'ok',
          fetchedAt: new Date().toISOString(),
        }),
        { status: 200 }
      )
    );

    render(
      <>
        <h1>Needs You</h1>
        <TimActionRequiredSection presentation='page' />
      </>
    );
    expect(
      await screen.findByRole('link', { name: 'Review release' })
    ).toHaveAttribute('href', 'https://linear.app/jovie/issue/JOV-1');
    expect(screen.getAllByText('Needs You')).toHaveLength(1);
    expect(screen.getByText('1 decision')).toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'Founder Decisions' });
    expect(region).not.toHaveClass('bg-surface-1');
    expect(region.querySelector('[data-shell-list-row]')).not.toHaveClass(
      'bg-surface-0',
      'border-subtle'
    );
    expect(
      screen.getByRole('button', { name: 'Mark "Review release" as done' })
    ).toBeEnabled();
  });

  it('does not keep raw red-* priority/overdue classes in source (JOV-6773)', () => {
    const source = readFileSync(
      resolve(__dirname, './TimActionRequiredSection.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/\bred-\d/);
    expect(source).toContain('text-error');
  });
});

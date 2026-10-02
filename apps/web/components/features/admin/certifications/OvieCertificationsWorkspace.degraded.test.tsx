import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import { OvieCertificationsWorkspace } from './OvieCertificationsWorkspace';

const mocks = vi.hoisted(() => ({ query: vi.fn(), refetch: vi.fn() }));
vi.mock('@/lib/queries/useOvieCertificationsQuery', () => ({
  useOvieCertificationsQuery: mocks.query,
  useOvieCertificationDecisionMutation: () => ({ mutateAsync: vi.fn() }),
  getCertificationDecisionErrorMessage: () => 'Try again.',
}));
vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));
vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('certification inventory recovery', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['domain', 'refresh'] as const)(
    'does not claim there are no items after a %s failure',
    failure => {
      const inventory = fixtureInventory();
      mocks.query.mockReturnValue({
        data: {
          ...inventory,
          rows: [],
          domains:
            failure === 'domain'
              ? inventory.domains.map(domain => ({
                  ...domain,
                  status: 'error',
                }))
              : inventory.domains,
          issues: [],
        },
        isLoading: false,
        isFetching: false,
        isError: failure === 'refresh',
        refetch: mocks.refetch,
      });
      render(
        <TooltipProvider>
          <OvieCertificationsWorkspace />
        </TooltipProvider>
      );
      expect(screen.queryByText('No certification items yet')).toBeNull();
      expect(
        screen.getByText('Certifications unavailable')
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(mocks.refetch).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps available rows usable when another source fails', () => {
    mocks.query.mockReturnValue({
      data: {
        ...fixtureInventory(),
        issues: [
          {
            domain: null,
            source: 'ovie_operating_kv',
            message: 'Inventory read failed.',
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: mocks.refetch,
    });
    render(
      <TooltipProvider>
        <OvieCertificationsWorkspace />
      </TooltipProvider>
    );
    expect(screen.getByText('Flow signup-golden-path')).toBeInTheDocument();
    expect(screen.queryByText('Certifications unavailable')).toBeNull();
  });
});

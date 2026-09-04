import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImpersonationBanner } from './ImpersonationBanner';

const {
  mockMutate,
  mockRefetch,
  mockUseEndImpersonationMutation,
  mockUseImpersonationQuery,
} = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockRefetch: vi.fn(),
  mockUseEndImpersonationMutation: vi.fn(),
  mockUseImpersonationQuery: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  useEndImpersonationMutation: () => mockUseEndImpersonationMutation(),
  useImpersonationQuery: () => mockUseImpersonationQuery(),
}));

function mockImpersonation(overrides = {}) {
  mockUseImpersonationQuery.mockReturnValue({
    data: {
      enabled: true,
      isImpersonating: true,
      effectiveClerkId: 'user_active_impersonation_123456789',
      timeRemainingMs: 125_000,
      ...overrides,
    },
    isLoading: false,
    refetch: mockRefetch,
  });
  mockUseEndImpersonationMutation.mockReturnValue({
    isPending: false,
    mutate: mockMutate,
  });
}

describe('ImpersonationBanner', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the active impersonation warning and countdown affordances', async () => {
    mockImpersonation();

    render(<ImpersonationBanner />);

    expect(screen.getByTestId('impersonation-banner')).toHaveAttribute(
      'role',
      'alert'
    );
    expect(screen.getByText('Admin Impersonation Active')).toBeInTheDocument();
    expect(screen.getByText(/user_active_impe/)).toBeInTheDocument();
    expect(await screen.findByText('2:05')).toBeInTheDocument();
  });

  it('minimizes to a fixed action without ending the session', () => {
    mockImpersonation();

    render(<ImpersonationBanner />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Minimize Impersonation Banner',
      })
    );

    expect(
      screen.queryByTestId('impersonation-banner')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Impersonating/ })
    ).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('calls the end-impersonation mutation from the primary action', () => {
    mockImpersonation();

    render(<ImpersonationBanner onEnd={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'End Session' }));

    expect(mockMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });
});

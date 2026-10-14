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
      effectiveUserId: '11111111-1111-4111-8111-111111111111',
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
    vi.unstubAllGlobals();
  });

  it('renders the active impersonation warning and countdown affordances', async () => {
    mockImpersonation();

    render(<ImpersonationBanner />);

    expect(screen.getByTestId('impersonation-banner')).toHaveAttribute(
      'role',
      'alert'
    );
    expect(screen.getByText('Admin Impersonation Active')).toBeInTheDocument();
    expect(screen.getByText(/11111111-1111-41/)).toBeInTheDocument();
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

  it('returns to the administrator surface after ending impersonation', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    mockImpersonation();
    mockMutate.mockImplementation(
      (_input, options: { onSuccess?: () => void }) => options.onSuccess?.()
    );

    render(<ImpersonationBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'End Session' }));

    expect(assign).toHaveBeenCalledWith('/app/ov');
  });
});

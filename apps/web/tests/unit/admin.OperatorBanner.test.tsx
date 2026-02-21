import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OperatorBanner } from '@/components/admin/OperatorBanner';

vi.mock('@/lib/queries/useEnvHealthQuery', () => ({
  useEnvHealthQuery: vi.fn().mockReturnValue({
    data: {
      ok: false,
      details: {
        currentValidation: {
          critical: ['Missing NEXTAUTH_URL'],
          errors: [],
          warnings: [],
        },
      },
    },
  }),
}));

describe('OperatorBanner', () => {
  it('renders without QueryClientProvider', () => {
    expect(() => render(<OperatorBanner isAdmin />)).not.toThrow();
  });

  it('renders inside QueryClientProvider', async () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <OperatorBanner isAdmin />
      </QueryClientProvider>
    );

    expect(await screen.findByText('Environment Issues:')).toBeInTheDocument();
  });
});

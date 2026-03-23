import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperatorBanner } from '@/features/admin/OperatorBanner';

const mockClientEnv = vi.hoisted(() => ({
  IS_E2E: false,
}));

vi.mock('@/lib/env-client', () => ({
  env: mockClientEnv,
}));

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
  afterEach(() => {
    mockClientEnv.IS_E2E = false;
  });

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

  it('stays hidden in E2E mode', async () => {
    mockClientEnv.IS_E2E = true;

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <OperatorBanner isAdmin />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText('Environment Issues:')).not.toBeInTheDocument();
    });
  });
});

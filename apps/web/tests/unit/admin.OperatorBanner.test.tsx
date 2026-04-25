import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

  it('stays hidden when env health endpoint returns a rate-limited (healthy-shaped) payload', async () => {
    const { useEnvHealthQuery } = await import(
      '@/lib/queries/useEnvHealthQuery'
    );
    const mocked = useEnvHealthQuery as unknown as ReturnType<typeof vi.fn>;
    const previous = mocked.getMockImplementation();
    mocked.mockReturnValue({
      data: {
        service: 'env',
        status: 'ok',
        ok: true,
        timestamp: new Date().toISOString(),
        details: {
          environment: 'unknown',
          platform: 'unknown',
          nodeVersion: 'unknown',
          startupValidationCompleted: false,
          currentValidation: {
            valid: true,
            errors: [],
            warnings: [],
            critical: [],
          },
          integrations: {
            database: false,
            auth: false,
            payments: false,
            images: false,
          },
        },
      },
    });

    try {
      const queryClient = new QueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <OperatorBanner isAdmin />
        </QueryClientProvider>
      );

      expect(screen.queryByText('Environment Issues:')).not.toBeInTheDocument();
    } finally {
      if (previous) {
        mocked.mockImplementation(previous);
      }
    }
  });

  it('stays hidden in E2E mode', () => {
    mockClientEnv.IS_E2E = true;

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <OperatorBanner isAdmin />
      </QueryClientProvider>
    );

    expect(screen.queryByText('Environment Issues:')).not.toBeInTheDocument();
  });
});

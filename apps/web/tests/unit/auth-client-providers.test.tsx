import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { valuesProviderRenderCount } = vi.hoisted(() => ({
  valuesProviderRenderCount: { n: 0 },
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  ClerkSafeValuesProvider: ({ children }: { children: React.ReactNode }) => {
    valuesProviderRenderCount.n += 1;
    return <div data-testid='jovie-auth-values-provider'>{children}</div>;
  },
}));

vi.mock('@/components/providers/QueryProvider', () => ({
  QueryProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='query-provider'>{children}</div>
  ),
}));

import { AuthClientProviders } from '@/components/providers/AuthClientProviders';

describe('AuthClientProviders (Better Auth)', () => {
  beforeEach(() => {
    valuesProviderRenderCount.n = 0;
  });

  it('mounts Jovie auth values provider + QueryProvider (no ClerkProvider)', () => {
    render(
      <AuthClientProviders>
        <span>child</span>
      </AuthClientProviders>
    );

    expect(screen.getByTestId('jovie-auth-values-provider')).toBeTruthy();
    expect(screen.getByTestId('query-provider')).toBeTruthy();
    expect(screen.getByText('child')).toBeTruthy();
    expect(screen.queryByTestId('clerk-provider')).toBeNull();
    expect(valuesProviderRenderCount.n).toBe(1);
  });

  it('ignores legacy forceEnableClerk / publishableKey props', () => {
    render(
      <AuthClientProviders forceEnableClerk publishableKey='pk_test_legacy'>
        <span>auth-page</span>
      </AuthClientProviders>
    );

    // Still only the BA values provider — props are inert post-cutover.
    expect(screen.getByTestId('jovie-auth-values-provider')).toBeTruthy();
    expect(screen.queryByTestId('clerk-provider')).toBeNull();
  });
});

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { valuesProviderRenderCount } = vi.hoisted(() => ({
  valuesProviderRenderCount: { n: 0 },
}));

vi.mock('@/hooks/useJovieAuth', () => ({
  JovieAuthValuesProvider: ({ children }: { children: React.ReactNode }) => {
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

  it('mounts Jovie auth values provider + QueryProvider', () => {
    render(
      <AuthClientProviders>
        <span>child</span>
      </AuthClientProviders>
    );

    expect(screen.getByTestId('jovie-auth-values-provider')).toBeTruthy();
    expect(screen.getByTestId('query-provider')).toBeTruthy();
    expect(screen.getByText('child')).toBeTruthy();
    expect(valuesProviderRenderCount.n).toBe(1);
  });
});

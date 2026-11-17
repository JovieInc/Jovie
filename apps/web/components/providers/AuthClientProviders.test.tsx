import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('@/hooks/useJovieAuth', () => ({
  JovieAuthValuesProvider: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid='jovie-auth-values-provider'>{children}</div>
  ),
}));
vi.mock('./QueryProvider', () => ({
  QueryProvider: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid='query-provider'>{children}</div>
  ),
}));

import { AuthClientProviders } from './AuthClientProviders';

describe('AuthClientProviders', () => {
  it('nests the query provider inside the auth values provider', async () => {
    const { container } = render(
      <AuthClientProviders>
        <main>Auth route shell</main>
      </AuthClientProviders>
    );

    const values = screen.getByTestId('jovie-auth-values-provider');
    const query = screen.getByTestId('query-provider');
    expect(values).toContainElement(query);
    expect(query).toContainElement(screen.getByRole('main'));
    await expectNoA11yViolations(container);
  });

  it('passes long and right-to-left children through unchanged', async () => {
    const longCopy =
      'Sign in with the same verified email address that received your invite, then continue to your workspace, your releases and every profile you manage.';
    const { container } = render(
      <AuthClientProviders>
        <main dir='rtl' lang='ar'>
          <p>تسجيل الدخول</p>
          <p>{longCopy}</p>
        </main>
      </AuthClientProviders>
    );

    expect(screen.getByText('تسجيل الدخول')).toBeInTheDocument();
    expect(screen.getByText(longCopy)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ClientAuthBootstrap } from '@/lib/auth/dev-test-auth-types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/chat',
}));
vi.mock('@/hooks/useJovieAuth', () => ({
  JovieAuthDefaultsProvider: ({
    children,
  }: {
    readonly children: ReactNode;
  }) => <div data-testid='jovie-auth-defaults'>{children}</div>,
  JovieAuthValuesProvider: ({
    children,
    initialUser,
  }: {
    readonly children: ReactNode;
    readonly initialUser?: {
      id?: string;
      email?: string;
      name?: string;
      username?: string | null;
    } | null;
  }) => (
    <div
      data-testid='jovie-auth-values'
      data-initial-user={initialUser ? JSON.stringify(initialUser) : ''}
    >
      {children}
    </div>
  ),
}));
vi.mock('./CoreProviders', () => ({
  CoreProviders: ({
    children,
    initialThemeMode,
  }: {
    readonly children: ReactNode;
    readonly initialThemeMode?: string;
  }) => (
    <div data-testid='core-providers' data-theme-mode={initialThemeMode}>
      {children}
    </div>
  ),
}));
vi.mock('./QueryProvider', () => ({
  QueryProvider: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid='query-provider'>{children}</div>
  ),
}));

import { ClientProviders } from './ClientProviders';

const BOOTSTRAP: ClientAuthBootstrap = {
  isAuthenticated: true,
  userId: 'user-1',
  email: 'artist@example.com',
  username: null,
  fullName: 'Tim White',
  isAdmin: false,
  persona: 'creator',
};

describe('ClientProviders', () => {
  it('seeds the auth values provider from a partial bootstrap with no username', async () => {
    const { container } = render(
      <ClientProviders authBootstrap={BOOTSTRAP} initialThemeMode='light'>
        <main>Signed-in app shell</main>
      </ClientProviders>
    );

    expect(
      JSON.parse(
        screen.getByTestId('jovie-auth-values').dataset.initialUser ?? '{}'
      )
    ).toEqual({
      id: 'user-1',
      email: 'artist@example.com',
      name: 'Tim White',
      username: null,
    });
    expect(screen.getByTestId('core-providers')).toHaveAttribute(
      'data-theme-mode',
      'light'
    );
    expect(screen.getByRole('main')).toHaveTextContent('Signed-in app shell');
    await expectNoA11yViolations(container);
  });

  it('keeps a live bootstrap session even when signed-out defaults are forced', () => {
    render(
      <ClientProviders authBootstrap={BOOTSTRAP} forceSignedOutDefaults>
        <main>Public profile shell</main>
      </ClientProviders>
    );

    expect(screen.getByTestId('jovie-auth-values')).toBeInTheDocument();
    expect(screen.queryByTestId('jovie-auth-defaults')).not.toBeInTheDocument();
  });

  it('uses signed-out defaults with no session and stays axe-clean', async () => {
    const { container } = render(
      <ClientProviders forceSignedOutDefaults>
        <main>Public profile shell</main>
      </ClientProviders>
    );

    expect(screen.getByTestId('jovie-auth-defaults')).toBeInTheDocument();
    expect(screen.getByTestId('core-providers')).toHaveAttribute(
      'data-theme-mode',
      'dark'
    );
    await expectNoA11yViolations(container);
  });

  it('skips core providers but keeps the query provider, with RTL children', async () => {
    const { container } = render(
      <ClientProviders skipCoreProviders>
        <main dir='rtl' lang='ar'>
          محتوى الصفحة
        </main>
      </ClientProviders>
    );

    expect(screen.queryByTestId('core-providers')).not.toBeInTheDocument();
    expect(screen.getByTestId('query-provider')).toContainElement(
      screen.getByRole('main')
    );
    expect(screen.getByTestId('jovie-auth-values')).toHaveAttribute(
      'data-initial-user',
      ''
    );
    await expectNoA11yViolations(container);
  });
});

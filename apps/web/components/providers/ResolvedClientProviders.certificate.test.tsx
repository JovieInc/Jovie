import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getClientAuthBootstrap } from '@/lib/auth/dev-test-auth.server';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ResolvedClientProviders } from './ResolvedClientProviders';

vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getClientAuthBootstrap: vi.fn(),
}));

vi.mock('@/components/providers/ClientProviders', () => ({
  ClientProviders: ({
    children,
    authBootstrap,
    forceSignedOutDefaults,
    initialThemeMode,
    skipCoreProviders,
  }: {
    readonly children: ReactNode;
    readonly authBootstrap?: { userId?: string } | null;
    readonly forceSignedOutDefaults?: boolean;
    readonly initialThemeMode?: string;
    readonly skipCoreProviders?: boolean;
  }) => (
    <div
      data-testid='client-providers'
      data-user={authBootstrap?.userId ?? ''}
      data-signed-out={String(forceSignedOutDefaults)}
      data-theme-mode={initialThemeMode ?? ''}
      data-skip-core={String(skipCoreProviders)}
    >
      {children}
    </div>
  ),
}));

describe('ResolvedClientProviders certificate', () => {
  it('forwards every flag with the resolved bootstrap and stays axe-clean', async () => {
    vi.mocked(getClientAuthBootstrap).mockResolvedValue({
      isAuthenticated: true,
      userId: 'user-1',
      email: 'artist@example.com',
      username: 'timwhite',
      fullName: 'Tim White',
      isAdmin: false,
      persona: 'creator',
    });

    const { container } = render(
      await ResolvedClientProviders({
        children: <main>Resolved app shell</main>,
        forceSignedOutDefaults: true,
        initialThemeMode: 'light',
        skipCoreProviders: true,
      })
    );

    const providers = screen.getByTestId('client-providers');
    expect(providers).toHaveAttribute('data-user', 'user-1');
    expect(providers).toHaveAttribute('data-signed-out', 'true');
    expect(providers).toHaveAttribute('data-theme-mode', 'light');
    expect(providers).toHaveAttribute('data-skip-core', 'true');
    expect(providers).toContainElement(screen.getByRole('main'));
    await expectNoA11yViolations(container);
  });

  it('defaults to live session wiring with no bootstrap, with RTL children', async () => {
    vi.mocked(getClientAuthBootstrap).mockResolvedValue(null);

    const { container } = render(
      await ResolvedClientProviders({
        children: (
          <main dir='rtl' lang='ar'>
            محتوى الصفحة
          </main>
        ),
      })
    );

    const providers = screen.getByTestId('client-providers');
    expect(providers).toHaveAttribute('data-user', '');
    expect(providers).toHaveAttribute('data-signed-out', 'false');
    expect(screen.getByRole('main')).toHaveTextContent('محتوى الصفحة');
    await expectNoA11yViolations(container);
  });
});

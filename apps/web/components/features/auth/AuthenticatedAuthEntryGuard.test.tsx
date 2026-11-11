import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { replaceMock, searchParamsState, authState } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchParamsState: { value: '' },
  authState: {
    isLoaded: true,
    isSignedIn: false,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => authState,
}));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AuthenticatedAuthEntryGuard } from '@/components/features/auth/AuthenticatedAuthEntryGuard';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

/**
 * Colocated contract coverage for AuthenticatedAuthEntryGuard. The route-level
 * guard is the single owner of the signed-in redirect on /signup and /signin
 * (JOV-6450) — the auth forms must never blank independently.
 */
describe('AuthenticatedAuthEntryGuard', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    authState.isLoaded = true;
    authState.isSignedIn = false;
    searchParamsState.value = '';
    document.cookie =
      '__client_uat=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  });

  it('renders children until a confirmed session redirects', async () => {
    const { container } = render(
      <AuthenticatedAuthEntryGuard>
        <main>
          <h1>Sign up</h1>
          <p>Sign-up form</p>
        </main>
      </AuthenticatedAuthEntryGuard>
    );

    expect(screen.getByText('Sign-up form')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    // The guard adds no markup of its own; axe audits the children it passes through.
    await expectNoA11yViolations(container);
  });

  it('redirects a confirmed signed-in session via the canonical route redirect', async () => {
    authState.isSignedIn = true;

    const { container } = render(
      <AuthenticatedAuthEntryGuard>
        <div>Sign-up form</div>
      </AuthenticatedAuthEntryGuard>
    );

    expect(screen.queryByText('Sign-up form')).not.toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
    // While redirecting the guard renders null, so axe audits the empty container.
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('re-checks the session when the page is restored from the back-forward cache', () => {
    const { rerender } = render(
      <AuthenticatedAuthEntryGuard>
        <div>Sign-up form</div>
      </AuthenticatedAuthEntryGuard>
    );
    expect(replaceMock).not.toHaveBeenCalled();

    authState.isSignedIn = true;
    rerender(
      <AuthenticatedAuthEntryGuard>
        <div>Sign-up form</div>
      </AuthenticatedAuthEntryGuard>
    );
    replaceMock.mockClear();

    const restore = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(restore, 'persisted', { value: true });
    act(() => {
      globalThis.dispatchEvent(restore);
    });

    expect(replaceMock).toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
  });

  it('keeps the auth form mounted while a leftover activity cookie is unconfirmed', () => {
    authState.isLoaded = false;
    authState.isSignedIn = false;
    document.cookie = '__client_uat=1700000000';

    render(
      <AuthenticatedAuthEntryGuard>
        <div>Sign-up form</div>
      </AuthenticatedAuthEntryGuard>
    );

    expect(screen.getByText('Sign-up form')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('renders the guarded component source (guard owns the signed-in redirect)', () => {
    const src = readFileSync(
      resolve(
        process.cwd(),
        'components/features/auth/AuthenticatedAuthEntryGuard.tsx'
      ),
      'utf8'
    );
    expect(src).toContain('export function AuthenticatedAuthEntryGuard');
    expect(src).toContain('redirectSignedInVisitor');
  });
});

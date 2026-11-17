import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut: signOutMock }),
}));

vi.mock('@/hooks/useMobileKeyboard', () => ({
  useMobileKeyboard: () => ({ isKeyboardVisible: false }),
}));

import { AuthPageSkeleton } from './AuthPageSkeleton';

describe('AuthPageSkeleton certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the loading form inside the auth layout with its title', async () => {
    const { container } = render(
      <AuthPageSkeleton formTitle='Sign in to Jovie' />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Sign in to Jovie' })
    ).toBeInTheDocument();
    expect(container.querySelector('#auth-form')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows the footer prompt and link when asked', async () => {
    const { container } = render(
      <AuthPageSkeleton
        formTitle='Create your account'
        showFooterPrompt
        footerPrompt='Already have an account?'
        footerLinkText='Sign in'
        footerLinkHref='/signin'
      />
    );

    expect(screen.getByText(/Already have an account\?/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    await expectNoA11yViolations(container);
  });
});

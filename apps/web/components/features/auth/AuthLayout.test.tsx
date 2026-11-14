import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

// State and accessibility coverage for each AuthLayout chrome. The route
// landmark and keyboard contract lives in tests/unit/auth/AuthLayout.test.tsx.
const { keyboard, signOutMock } = vi.hoisted(() => ({
  keyboard: { visible: false },
  signOutMock: vi.fn(),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut: signOutMock }),
}));

vi.mock('@/hooks/useMobileKeyboard', () => ({
  useMobileKeyboard: () => ({ isKeyboardVisible: keyboard.visible }),
}));

import { AuthLayout } from './AuthLayout';

function Body() {
  return <p>Auth form body</p>;
}

describe('AuthLayout states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    keyboard.visible = false;
  });

  it('renders the stack chrome with a title, the form slot and a skip link', async () => {
    const { container } = render(
      <AuthLayout formTitle='Log in to Jovie'>
        <Body />
      </AuthLayout>
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Log in to Jovie' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to form' })).toHaveAttribute(
      'href',
      '#auth-form'
    );
    expect(container.querySelector('#auth-form')).toHaveTextContent(
      'Auth form body'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps the dark shell on the fixed on-media white in both themes', () => {
    const { container } = render(
      <AuthLayout formTitle='Log in to Jovie' showFooterPrompt>
        <Body />
      </AuthLayout>
    );

    const shell = container.querySelector('[data-auth-shell]');
    expect(shell).toHaveClass('text-on-media', '[color-scheme:dark]');
    expect(shell?.className).not.toMatch(/\btext-white\b/);
    const prompt = screen.getByText('No account?', { exact: false });
    expect(prompt).toHaveClass('text-on-media/58');
    expect(
      within(prompt).getByRole('link', { name: 'Create your account' })
    ).toHaveClass('text-on-media', 'underline');
  });

  it('renders the opt-in footer prompt with its cross-link', async () => {
    const { container } = render(
      <AuthLayout
        formTitle='Continue to Jovie'
        showFooterPrompt
        footerPrompt='Already have an account?'
        footerLinkText='Sign in'
        footerLinkHref='/signin'
      >
        <Body />
      </AuthLayout>
    );

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    await expectNoA11yViolations(container);
  });

  it('renders the split chrome with the corner mark and the brand panel', async () => {
    const { container } = render(
      <AuthLayout formTitle='Log in to Jovie' layoutVariant='split'>
        <Body />
      </AuthLayout>
    );

    expect(
      container.querySelector('[data-auth-layout-variant]')
    ).toHaveAttribute('data-auth-layout-variant', 'split');
    expect(screen.getByRole('link', { name: 'Go to homepage' })).toHaveClass(
      'text-on-media/45'
    );
    expect(
      screen.getByRole('region', { name: 'Product Preview' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the Splash B mark and hides it while the mobile keyboard is open', async () => {
    const { container, rerender } = render(
      <AuthLayout
        formTitle='Request Access'
        showFormTitle={false}
        chrome='splash-b'
      >
        <Body />
      </AuthLayout>
    );

    const mark = screen.getByRole('link', { name: 'Go to homepage' });
    expect(mark).toHaveClass('text-on-media');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    await expectNoA11yViolations(container);

    keyboard.visible = true;
    rerender(
      <AuthLayout
        formTitle='Request Access'
        showFormTitle={false}
        chrome='splash-b'
      >
        <Body />
      </AuthLayout>
    );
    expect(
      container.querySelector('[data-auth-splash-logo-slot] a')
    ).toHaveAttribute('tabindex', '-1');
  });

  it('signs out to the logout redirect from the account menu', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AuthLayout
        formTitle='Finish Setup'
        showLogoutButton
        logoutRedirectUrl='/signin'
      >
        <Body />
      </AuthLayout>
    );

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }));

    expect(signOutMock).toHaveBeenCalledWith({ redirectUrl: '/signin' });
    await expectNoA11yViolations(container);
  });

  it('has no axe violations for a long title in a right-to-left page', async () => {
    const title =
      'Continue to Jovie with the email address your label already uses';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AuthLayout formTitle={title} showFooterPrompt>
          <Body />
        </AuthLayout>
      </div>
    );

    expect(
      screen.getByRole('heading', { level: 1, name: title })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clerkRenderState, clerkSignInMock, searchParamsState } = vi.hoisted(
  () => ({
    clerkRenderState: {
      signIn: 'empty' as 'empty' | 'credential' | 'social',
    },
    clerkSignInMock: vi.fn(),
    searchParamsState: { value: '' },
  })
);

vi.mock('@clerk/nextjs', () => ({
  SignIn: (props: unknown) => {
    clerkSignInMock(props);

    if (clerkRenderState.signIn === 'credential') {
      return (
        <form data-testid='clerk-sign-in'>
          <input name='identifier' type='text' />
          <input name='password' type='password' />
          <button type='submit'>Continue</button>
        </form>
      );
    }

    if (clerkRenderState.signIn === 'social') {
      return (
        <div data-testid='clerk-sign-in'>
          <button type='button'>Continue with Google</button>
        </div>
      );
    }

    return <div data-testid='clerk-sign-in' />;
  },
  SignUp: () => <div data-testid='clerk-sign-up' />,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

import { authClerkLocalization } from '@/components/providers/clerkLocalization';
import { AuthShell } from '@/features/auth';

describe('AuthShell Clerk appearance guards', () => {
  beforeEach(() => {
    clerkRenderState.signIn = 'empty';
    clerkSignInMock.mockReset();
    searchParamsState.value = '';
  });

  it('keeps required provider and last-used badge layout guards after caller overrides', async () => {
    render(
      <AuthShell
        mode='sign-in'
        appearance={{
          elements: {
            lastAuthenticationStrategyBadge: {
              position: 'absolute',
              transform: 'translate(10px, -50%)',
            },
            socialButtonsBlockButton: {
              backgroundColor: 'rgb(1, 2, 3)',
              display: 'grid',
              overflow: 'hidden',
            },
            socialButtonsBlockButton__facebook: 'block',
          },
        }}
      />
    );

    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });

    const signInProps = clerkSignInMock.mock.calls[0]?.[0] as {
      readonly appearance?: {
        readonly elements?: Record<string, unknown>;
      };
    };
    const elements = signInProps.appearance?.elements;

    expect(elements?.socialButtonsBlockButton).toEqual(
      expect.objectContaining({
        backgroundColor: 'rgb(1, 2, 3)',
        display: 'flex',
        justifyContent: 'center',
        overflow: 'visible',
        position: 'relative',
      })
    );
    expect(elements?.lastAuthenticationStrategyBadge).toEqual(
      expect.objectContaining({
        position: 'static',
        transform: 'none',
        whiteSpace: 'nowrap',
      })
    );
    expect(elements?.socialButtonsBlockButton__facebook).toBe('hidden');
  });

  it('renders stable full-label provider slots before Clerk is ready', () => {
    const { container } = render(<AuthShell mode='sign-in' />);

    expect(
      container.querySelector('[data-auth-provider-slot="google"]')
    ).toHaveTextContent('Continue with Google');
    expect(
      container.querySelector('[data-auth-provider-slot="apple"]')
    ).toHaveTextContent('Continue with Apple');
  });

  it('releases the placeholder when Clerk renders a social-only start state', async () => {
    clerkRenderState.signIn = 'social';

    const { container } = render(<AuthShell mode='sign-in' />);

    await waitFor(() => {
      expect(container.firstElementChild).toHaveAttribute(
        'data-auth-shell-ready',
        'true'
      );
    });
    expect(
      container.querySelector('[data-auth-stable-placeholder]')
    ).toBeNull();
  });

  it('releases the placeholder when Clerk renders a credential-only start state', async () => {
    clerkRenderState.signIn = 'credential';

    const { container } = render(<AuthShell mode='sign-in' />);

    await waitFor(() => {
      expect(container.firstElementChild).toHaveAttribute(
        'data-auth-shell-ready',
        'true'
      );
    });
    expect(
      container.querySelector('[data-auth-stable-placeholder]')
    ).toBeNull();
  });

  it('keeps legal copy in stable line groups with valid fallback hrefs', () => {
    const { container } = render(<AuthShell mode='sign-up' />);

    expect(
      container.querySelector('[data-auth-legal-prefix]')
    ).toHaveTextContent('By signing up, you agree to our');
    expect(
      container.querySelector('[data-auth-legal-links]')
    ).toHaveTextContent('Terms of Service and Privacy Policy.');

    expect(container.querySelector('a[href="/legal/terms"]')).toHaveTextContent(
      'Terms of Service'
    );
    expect(
      container.querySelector('a[href="/legal/privacy"]')
    ).toHaveTextContent('Privacy Policy');
  });

  it('shares the same full provider copy with Clerk localization', () => {
    expect(authClerkLocalization.socialButtonsBlockButton).toBe(
      'Continue with {{provider|titleize}}'
    );
    expect(authClerkLocalization.socialButtonsBlockButtonManyInView).toBe(
      'Continue with {{provider|titleize}}'
    );
  });
});

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingChatEmptyIntro } from '@/components/features/onboarding/OnboardingChatEmptyIntro';
import { OnboardingShell } from '@/components/features/onboarding/OnboardingShell';
import { APP_ROUTES } from '@/constants/routes';

vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({ main }: { readonly main: ReactNode }) => <>{main}</>,
}));

vi.mock('@/components/organisms/sidebar', () => ({
  SidebarProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/components/features/onboarding/OnboardingChat', () => ({
  OnboardingChat: ({ headerOverlay }: { readonly headerOverlay?: boolean }) => (
    <div
      data-testid='onboarding-chat'
      data-header-overlay={headerOverlay ? 'true' : 'false'}
    />
  ),
}));

vi.mock('@/components/features/onboarding/OnboardingTurnstile', () => ({
  getBrowserTurnstileHostname: () => 'localhost',
  isOnboardingTurnstilePanelVisible: () => false,
  OnboardingTurnstile: () => null,
  resolveTurnstileSiteKey: () => null,
}));

vi.mock('@/components/features/onboarding/useOnboardingClaim', () => ({
  useOnboardingClaim: () => 'idle',
}));

describe('onboarding sign-in placement', () => {
  it('keeps the quiet sign-in link in flow above chat messages', () => {
    render(<OnboardingShell sessionLabel='pending' />);

    const header = screen.getByTestId('onboarding-sign-in-header');
    const chat = screen.getByTestId('onboarding-chat');
    expect(header).toHaveClass('flex', 'shrink-0', 'justify-end');
    expect(header).not.toHaveClass('absolute');
    expect(
      header.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      APP_ROUTES.SIGNIN
    );
  });

  it('keeps sign-in reachable when a taken handle tells the owner to sign in (JOV-7753)', () => {
    render(
      <OnboardingShell
        sessionLabel='pending'
        entryProfile={{
          status: 'claimed',
          handle: 'tim',
          displayName: 'Tim White',
          avatarUrl: null,
        }}
      />
    );

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      APP_ROUTES.SIGNIN
    );
  });

  it('hides sign-in after the server resolves an authenticated session', () => {
    render(<OnboardingShell sessionLabel='pending' isSignedIn />);

    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it.each([
    ['anonymous', undefined, 'true'],
    ['signed-in', true, 'false'],
  ] as const)(
    'reserves chat top clearance under the floating sign-in only while %s (JOV-7192)',
    (_label, isSignedIn, expected) => {
      render(
        <OnboardingShell sessionLabel='pending' isSignedIn={isSignedIn} />
      );

      expect(screen.getByTestId('onboarding-chat')).toHaveAttribute(
        'data-header-overlay',
        expected
      );
    }
  );

  it('keeps the taken-handle intro free of a second sign-in control (JOV-7753)', () => {
    render(
      <OnboardingChatEmptyIntro
        mode='handle_entry'
        entryProfile={{
          status: 'claimed',
          handle: 'tim',
          displayName: 'Tim White',
          avatarUrl: null,
        }}
        onTryAnotherName={() => {}}
      />
    );

    // The shell header owns Sign in; the intro offers the other next step.
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Try Another Name' })
    ).toBeInTheDocument();
  });

  it('removes the centered duplicate and starter rail from the blank entry', () => {
    render(<OnboardingChatEmptyIntro mode='blank' />);

    expect(screen.queryByText('Already have an account?')).toBeNull();
    expect(screen.queryByTestId('onboarding-sign-in-skip')).toBeNull();
    expect(screen.queryByTestId('onboarding-starter-suggestions')).toBeNull();
  });

  it.each(['prompt_handoff', 'spotify_handoff'] as const)(
    'keeps the %s intro free of verification theater (JOV-3379)',
    mode => {
      const { container } = render(<OnboardingChatEmptyIntro mode={mode} />);

      expect(container.textContent ?? '').not.toMatch(
        /verif|browser check|human/i
      );
      expect(screen.getByText('Your message is on its way.')).toBeTruthy();
    }
  );
});

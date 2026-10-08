import { act, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEntryProfileBuilderState,
  OnboardingShell,
} from './OnboardingShell';

vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({
    main,
    rightPanel,
  }: {
    readonly main: ReactNode;
    readonly rightPanel?: ReactNode;
  }) => (
    <>
      <div data-testid='onboarding-shell-main'>{main}</div>
      <div data-testid='onboarding-shell-overlay'>{rightPanel}</div>
    </>
  ),
}));

vi.mock('@/components/organisms/sidebar', () => ({
  SidebarProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

const builderState = vi.hoisted(() => ({ current: null as unknown }));
const chatProps = vi.hoisted(() => ({
  current: null as null | {
    onConversationActivity: () => void;
    onTurnstileRequired: (message?: string) => void;
    onTurnstileRejected: () => void;
    turnstileToken: string | null;
  },
}));

vi.mock('@/components/features/onboarding/OnboardingChat', () => ({
  OnboardingChat: (
    props: {
      readonly headerOverlay?: boolean;
      readonly onProfileBuilderChange?: (state: never) => void;
      readonly turnstilePanel: ReactNode;
    } & NonNullable<typeof chatProps.current>
  ) => {
    chatProps.current = props;
    const { headerOverlay, onProfileBuilderChange, turnstilePanel } = props;
    useEffect(() => {
      if (builderState.current) {
        onProfileBuilderChange?.(builderState.current as never);
      }
    }, [onProfileBuilderChange]);
    return (
      <>
        <div
          data-testid='onboarding-chat'
          data-header-overlay={headerOverlay ? 'true' : 'false'}
        />
        {turnstilePanel}
      </>
    );
  },
}));

const turnstileProps = vi.hoisted(() => ({
  current: null as {
    readonly onToken: (token: string) => void;
    readonly instruction: string | null;
    readonly focusSignal: number;
    readonly resetSignal: number;
    readonly onStateChange?: (state: {
      status: string;
      message: string | null;
    }) => void;
  } | null,
}));

vi.mock('@/components/features/onboarding/OnboardingTurnstile', () => ({
  getBrowserTurnstileHostname: () => 'localhost',
  isOnboardingTurnstilePanelVisible: () => false,
  OnboardingTurnstile: (props: NonNullable<typeof turnstileProps.current>) => {
    turnstileProps.current = props;
    return null;
  },
  resolveTurnstileSiteKey: () => null,
}));

const claimState = vi.hoisted(() => ({ value: 'error', trigger: 0 }));
vi.mock('@/components/features/onboarding/useOnboardingClaim', () => ({
  useOnboardingClaim: (trigger: number) => {
    claimState.trigger = trigger;
    return claimState.value;
  },
}));

describe('OnboardingShell status', () => {
  beforeEach(() => {
    claimState.value = 'error';
    claimState.trigger = 0;
    builderState.current = null;
    chatProps.current = null;
    turnstileProps.current = null;
  });

  it.each([false, true])(
    'forwards the server-selected Turnstile test mode (%s) to the widget',
    testMode => {
      render(
        <OnboardingShell sessionLabel='pending' turnstileTestMode={testMode} />
      );

      expect(turnstileProps.current).toMatchObject({ testMode });
    }
  );

  it('explains identity recovery without suggesting another handle or a blind retry', () => {
    claimState.value = 'identity-conflict';
    render(<OnboardingShell sessionLabel='pending' />);
    const alert = screen.getByText(
      /This Spotify artist already has a Jovie profile/
    );
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Sign in with the original account');
    expect(alert).toHaveTextContent(
      'Choosing another handle will not resolve this conflict'
    );
    expect(
      screen.queryByText(
        "We couldn't save your request. Refresh this page to try again."
      )
    ).not.toBeInTheDocument();
  });

  it('renders the claim-error status with the error token, not raw red-* (JOV-6773)', () => {
    render(<OnboardingShell sessionLabel='pending' />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      "We couldn't save your request. Refresh this page to try again."
    );
    expect(alert.className).toContain('border-error/20');
    expect(alert.className).toContain('text-error');
    expect(alert.className).not.toMatch(/\bred-\d/);
  });

  it('stacks chrome above chat in a column so the sign-in row cannot overlap messages (JOV-7193)', () => {
    render(<OnboardingShell sessionLabel='pending' />);

    const session = screen
      .getByTestId('onboarding-sign-in-header')
      .closest('[data-onboarding-session]');
    expect(session).toHaveClass('flex', 'flex-col', 'min-h-0', 'flex-1');
  });

  it('reports a failed chat start without verification jargon or error codes', () => {
    render(<OnboardingShell sessionLabel='pending' />);

    act(() => {
      turnstileProps.current?.onStateChange?.({
        status: 'error',
        message: null,
      });
    });

    const alert = screen.getByText(
      "We couldn't start your chat. Refresh the page to try again."
    );
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert.textContent).not.toMatch(/verification failed|\(\d+\)/i);
  });

  it('passes headerOverlay to the chat while the visitor is anonymous (JOV-7192)', () => {
    render(<OnboardingShell sessionLabel='pending' />);

    expect(screen.getByTestId('onboarding-chat')).toHaveAttribute(
      'data-header-overlay',
      'true'
    );
  });

  it('shows the side profile preview for a non-artist with a public profile (JOV-3379)', () => {
    builderState.current = {
      artist: null,
      artistConfirmed: false,
      handle: 'avery',
      socialLinks: ['https://instagram.com/avery'],
    };
    render(<OnboardingShell sessionLabel='pending' />);
    builderState.current = null;

    expect(screen.getByTestId('onboarding-profile-rail')).toBeInTheDocument();
  });

  it('previews the prebuilt page behind /start?handle= before the chat knows anything (JOV-7753)', () => {
    render(
      <OnboardingShell sessionLabel='pending' entryProfile={MEGARAN_ENTRY} />
    );

    expect(screen.getByTestId('onboarding-profile-rail')).toBeInTheDocument();
  });

  it('keeps the rail hidden for an open handle with no page yet', () => {
    render(
      <OnboardingShell
        sessionLabel='pending'
        entryProfile={{ status: 'available', handle: 'newartist' }}
      />
    );

    expect(
      screen.queryByTestId('onboarding-profile-rail')
    ).not.toBeInTheDocument();
  });

  it('keeps the profile preview in the chat main rather than the shell overlay', () => {
    render(
      <OnboardingShell sessionLabel='pending' entryProfile={MEGARAN_ENTRY} />
    );
    const preview = screen.getByTestId('onboarding-profile-rail');
    expect(screen.getByTestId('onboarding-shell-main')).toContainElement(
      preview
    );
    expect(screen.getByTestId('onboarding-shell-main')).toContainElement(
      screen.getByTestId('onboarding-chat')
    );
    expect(screen.getByTestId('onboarding-shell-overlay')).not.toContainElement(
      preview
    );
  });

  it('retries claim after a completed turn while retaining sign-in access', () => {
    render(<OnboardingShell sessionLabel='anonymous' />);
    expect(claimState.trigger).toBe(0);
    act(() => chatProps.current?.onConversationActivity());
    expect(claimState.trigger).toBe(1);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  it('clears a rejected challenge token and keeps a fresh verification action available', () => {
    render(<OnboardingShell sessionLabel='anonymous' />);
    act(() => chatProps.current?.onTurnstileRequired('Verify before sending'));
    expect(turnstileProps.current?.instruction).toBe('Verify before sending');
    expect(turnstileProps.current?.focusSignal).toBe(1);
    act(() => turnstileProps.current?.onToken('verified-test-token'));
    expect(chatProps.current?.turnstileToken).toBe('verified-test-token');
    expect(turnstileProps.current?.instruction).toBeNull();
    act(() => chatProps.current?.onTurnstileRejected());
    expect(chatProps.current?.turnstileToken).toBeNull();
    expect(turnstileProps.current?.resetSignal).toBe(1);
    expect(turnstileProps.current?.focusSignal).toBe(2);
    expect(turnstileProps.current?.instruction).toBe(
      'One quick check before we send'
    );
  });
});

const MEGARAN_ENTRY = {
  status: 'claimable',
  handle: 'megaran',
  displayName: 'Mega Ran',
  avatarUrl: 'https://blob.example.com/a.png',
  spotifyId: null,
  spotifyUrl: null,
  genres: ['hip hop'],
  socialLinks: ['https://instagram.com/megaran'],
  linkPlatforms: ['instagram'],
  linkCount: 1,
} as const;

describe('buildEntryProfileBuilderState (JOV-7753)', () => {
  it('maps a prebuilt page to rail preview state and nothing else', () => {
    expect(buildEntryProfileBuilderState(MEGARAN_ENTRY)).toEqual({
      artist: {
        id: 'handle-megaran',
        name: 'Mega Ran',
        url: '',
        imageUrl: 'https://blob.example.com/a.png',
        genres: ['hip hop'],
      },
      artistConfirmed: false,
      handle: 'megaran',
      socialLinks: ['https://instagram.com/megaran'],
    });
    expect(
      buildEntryProfileBuilderState({ status: 'available', handle: 'x-y-z' })
        .artist
    ).toBeNull();
    expect(buildEntryProfileBuilderState(null).artist).toBeNull();
  });
});

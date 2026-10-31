import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEntryProfileBuilderState,
  OnboardingShell,
  OnboardingShellStatus,
} from './OnboardingShell';

vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({
    main,
    rightPanel,
    flushContent,
  }: {
    readonly main: ReactNode;
    readonly rightPanel?: ReactNode;
    readonly flushContent?: boolean;
  }) => (
    <>
      <div
        data-testid='onboarding-shell-main'
        data-flush-content={flushContent ? 'true' : 'false'}
      >
        {main}
      </div>
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
    turnstileHasSiteKey: boolean;
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

const claimState = vi.hoisted(() => ({
  value: 'error',
  trigger: 0,
  enabled: true,
}));
vi.mock('@/components/features/onboarding/useOnboardingClaim', () => ({
  useOnboardingClaim: (trigger: number, enabled: boolean) => {
    claimState.trigger = trigger;
    claimState.enabled = enabled;
    return claimState.value;
  },
}));

/** A restored transcript as `readOnboardingMessages` builds it. */
function nextStepTranscript(
  kind: 'waitlist' | 'instant_access' | 'needs_more_info'
) {
  return [
    ...STARTED_CONVERSATION,
    {
      id: 'm2',
      role: 'assistant' as const,
      parts: [
        { type: 'text' as const, text: 'Sign up below to hold your name.' },
        {
          type: 'dynamic-tool' as const,
          toolName: 'proposeNextStep',
          toolCallId: 'call-next-step',
          state: 'output-available' as const,
          input: {},
          output: {
            action: 'propose_next_step',
            decision: { kind, rationale: 'test', score: 1 },
          },
        },
      ],
    },
  ];
}

const STARTED_CONVERSATION = [
  {
    id: 'm1',
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: 'I make music' }],
  },
];

describe('OnboardingShell status', () => {
  it('does not offer Start Over on a first visit with nothing to discard', () => {
    render(
      <OnboardingShell
        sessionLabel='pending'
        isSignedIn={false}
        onRestart={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Start Over' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
  });

  it('keeps explicit restart/logout visible and prevents them during a pending turn', () => {
    const restart = vi.fn();
    const logout = vi.fn();
    const { rerender } = render(
      <OnboardingShell
        sessionLabel='pending'
        isSignedIn
        initialMessages={STARTED_CONVERSATION}
        onRestart={restart}
        onLogout={logout}
      />
    );
    expect(screen.getByTestId('onboarding-shell-main')).toHaveAttribute(
      'data-flush-content',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start Over' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
    expect(restart).toHaveBeenCalledOnce();
    expect(logout).toHaveBeenCalledOnce();
    rerender(
      <OnboardingShell
        sessionLabel='pending'
        isSignedIn
        initialMessages={STARTED_CONVERSATION}
        onRestart={restart}
        onLogout={logout}
        controlsDisabled
      />
    );
    expect(screen.getByRole('button', { name: 'Start Over' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });
  beforeEach(() => {
    claimState.value = 'error';
    claimState.trigger = 0;
    builderState.current = null;
    chatProps.current = null;
    turnstileProps.current = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['', false, false],
    ['configured-public-key', false, true],
    ['   ', false, false],
    ['', true, true],
  ] as const)(
    'forwards resolved key availability for configured key %j and test mode %s',
    (configuredKey, testMode, expected) => {
      vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', configuredKey);
      render(
        <OnboardingShell sessionLabel='pending' turnstileTestMode={testMode} />
      );

      expect(chatProps.current?.turnstileHasSiteKey).toBe(expected);
    }
  );

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
    const alert = screen.getByText(/This artist already has a Jovie profile/);
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Sign in with the original account');
    fireEvent.click(screen.getByRole('button', { name: 'Profile Conflict' }));
    expect(
      screen.getByRole('link', { name: 'Sign in with original account' })
    ).toHaveAttribute('href', '/signin');
    expect(
      alert.closest('[data-testid=onboarding-identity-recovery-slot]')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "We couldn't save your request. Refresh this page to try again."
      )
    ).not.toBeInTheDocument();
  });

  it('keeps recovery below navigation and above the transcript, using existing logout authority', () => {
    claimState.value = 'identity-conflict';
    const logout = vi.fn();
    render(
      <OnboardingShell
        sessionLabel='conflict'
        isSignedIn
        onRestart={vi.fn()}
        onLogout={logout}
      />
    );
    const header = screen.getByTestId('onboarding-sign-in-header');
    const slot = screen.getByTestId('onboarding-identity-recovery-slot');
    expect(slot).toContainElement(header);
    fireEvent.click(screen.getByRole('button', { name: 'Profile Conflict' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch Account' }));
    expect(logout).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: /claim/i })).toBeNull();
  });

  it('keeps the existing header when async conflict arrives and opens details only on request', () => {
    claimState.value = 'idle';
    const { rerender } = render(<OnboardingShell sessionLabel='stable' />);
    const slot = screen.getByTestId('onboarding-identity-recovery-slot');
    claimState.value = 'identity-conflict';
    rerender(<OnboardingShell sessionLabel='stable' />);
    expect(screen.getByTestId('onboarding-identity-recovery-slot')).toBe(slot);
    expect(
      screen.queryByRole('link', { name: 'Sign in with original account' })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Profile Conflict' }));
    expect(
      screen.getByRole('link', { name: 'Sign in with original account' })
    ).toBeVisible();
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

  it('keeps the compact sign-in face inside the canonical 44px hit target (JOV-4411)', () => {
    render(<OnboardingShell sessionLabel='pending' />);

    const signIn = screen.getByRole('link', { name: 'Sign in' });
    expect(signIn).toHaveAttribute('data-variant', 'link');
    expect(signIn).toHaveAttribute('data-appearance', 'compact');
    expect(signIn).toHaveClass('btn-linear-login', 'focus-ring-themed');
    expect(signIn.className).toContain('before:min-h-11');
    expect(signIn.className).toContain('before:min-w-11');
    expect(signIn.className).not.toMatch(/(?:^|\s)h-11(?:\s|$)/);
  });

  it('keeps the real sign-in link named and reachable before its label child arrives', () => {
    render(<OnboardingShell sessionLabel='pending' />);

    const signIn = screen.getByRole('link', { name: 'Sign in' });
    const destination = signIn.getAttribute('href');
    const labelNodes = Array.from(signIn.childNodes);
    signIn.replaceChildren();

    expect(screen.getByRole('link', { name: 'Sign in' })).toBe(signIn);
    expect(signIn).toHaveAttribute('href', destination);
    signIn.focus();
    expect(signIn).toHaveFocus();

    signIn.append(...labelNodes);
    expect(signIn).toHaveTextContent('Sign in');
    expect(screen.getByRole('link', { name: 'Sign in' })).toBe(signIn);
    expect(signIn).toHaveFocus();
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

  it('shows the draft profile for an open handle from the first paint (Pen R6As7U)', () => {
    render(
      <OnboardingShell
        sessionLabel='pending'
        entryProfile={{ status: 'available', handle: 'newartist' }}
      />
    );

    const rail = screen.getByTestId('onboarding-profile-rail');
    expect(
      within(rail).getByRole('heading', { name: 'Your Draft Profile' })
    ).toBeInTheDocument();
    expect(within(rail).getByText('jov.ie/newartist')).toBeInTheDocument();
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

  it('restores owned history without redirecting and retries the existing claim after a genuine turn', () => {
    render(
      <OnboardingShell
        sessionLabel='saved'
        isSignedIn
        resumeOwnedConversation
      />
    );
    expect(claimState.trigger).toBe(0);
    expect(claimState.enabled).toBe(false);

    act(() => chatProps.current?.onConversationActivity());

    expect(claimState.trigger).toBe(1);
    expect(claimState.enabled).toBe(true);
  });

  // Golden-path cert 2026-10-31 pm (walk-m1..m3): the OTP form hard-navigates
  // to /start while a claim POST from the pre-navigation page is in flight.
  // The server commits ownership, the response is lost, and the reloaded page
  // restores an owned transcript that already ends in the waitlist decision.
  // That restore must claim on mount (the server's idempotent alreadyClaimed
  // recovery returns the receipt), or the visitor waits on "Saving your
  // request…" forever.
  it.each(['waitlist', 'instant_access'] as const)(
    'claims on mount when a restored owned transcript already ends in a %s decision',
    kind => {
      render(
        <OnboardingShell
          sessionLabel='saved'
          isSignedIn
          resumeOwnedConversation
          initialMessages={nextStepTranscript(kind)}
        />
      );

      expect(claimState.trigger).toBe(0);
      expect(claimState.enabled).toBe(true);
    }
  );

  it('keeps a restored owned transcript without a terminal decision quiet until a genuine turn', () => {
    render(
      <OnboardingShell
        sessionLabel='saved'
        isSignedIn
        resumeOwnedConversation
        initialMessages={nextStepTranscript('needs_more_info')}
      />
    );

    expect(claimState.enabled).toBe(false);
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

  it('seeds the draft panel with an open handle before the first message (Pen R6As7U)', () => {
    expect(
      buildEntryProfileBuilderState({ status: 'available', handle: 'timwhite' })
    ).toEqual({
      artist: null,
      artistConfirmed: false,
      handle: 'timwhite',
      socialLinks: [],
    });
  });
});

// JOV-7973: the /start shell pane must clip without owning a programmatically
// scrollable box. overflow:hidden stays scrollable, so a journey scrollIntoView
// can leave the whole route (profile rail included) shifted under the clip —
// the golden-path preview badge then reads a stable viewport ratio 0.8125 that
// keyboard End/Home on the rail can never undo.
describe('OnboardingShell route pane (JOV-7973)', () => {
  it('clips the shell content pane instead of owning a scroll box', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/features/onboarding/OnboardingShell.tsx'
      ),
      'utf8'
    );

    expect(source).toContain("contentClassName='overflow-clip!'");
    expect(source).not.toContain("contentClassName='overflow-hidden!'");
  });
});

describe('OnboardingShellStatus (2026-10-31 golden-path walk)', () => {
  it('shows the status in words, never a bare skeleton bar', () => {
    render(
      <OnboardingShellStatus
        kind='status'
        message='Saving this conversation to your account…'
        visible
      />
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(
      'Saving this conversation to your account…'
    );
    expect(status.querySelector('.sr-only')).toBeNull();
  });
});

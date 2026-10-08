import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingShell } from './OnboardingShell';

const state = vi.hoisted(() => ({
  chat: null as null | {
    onConversationActivity: () => void;
    onTurnstileRequired: (message?: string) => void;
    onTurnstileRejected: () => void;
    turnstileToken: string | null;
  },
  challenge: null as null | {
    onToken: (token: string) => void;
    instruction: string | null;
    focusSignal: number;
    resetSignal: number;
  },
  claimTrigger: 0,
}));
vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({ main }: { main: ReactNode }) => <>{main}</>,
}));
vi.mock('@/components/organisms/sidebar', () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('./OnboardingChat', () => ({
  OnboardingChat: (
    props: NonNullable<typeof state.chat> & { turnstilePanel: ReactNode }
  ) => {
    state.chat = props;
    return <>{props.turnstilePanel}</>;
  },
}));
vi.mock('./OnboardingTurnstile', () => ({
  getBrowserTurnstileHostname: () => 'localhost',
  isOnboardingTurnstilePanelVisible: () => true,
  OnboardingTurnstile: (props: NonNullable<typeof state.challenge>) => {
    state.challenge = props;
    return null;
  },
}));
vi.mock('./useOnboardingClaim', () => ({
  useOnboardingClaim: (trigger: number) => {
    state.claimTrigger = trigger;
    return 'idle';
  },
}));

describe('onboarding page recovery context', () => {
  it('retries claim after a completed turn while retaining sign-in access', () => {
    render(<OnboardingShell sessionLabel='anonymous' />);
    expect(state.claimTrigger).toBe(0);
    act(() => state.chat?.onConversationActivity());
    expect(state.claimTrigger).toBe(1);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  it('clears a rejected challenge token and keeps a fresh verification action available', () => {
    render(<OnboardingShell sessionLabel='anonymous' />);
    act(() => state.chat?.onTurnstileRequired('Verify before sending'));
    expect(state.challenge?.instruction).toBe('Verify before sending');
    expect(state.challenge?.focusSignal).toBe(1);
    act(() => state.challenge?.onToken('verified-test-token'));
    expect(state.chat?.turnstileToken).toBe('verified-test-token');
    expect(state.challenge?.instruction).toBeNull();
    act(() => state.chat?.onTurnstileRejected());
    expect(state.chat?.turnstileToken).toBeNull();
    expect(state.challenge?.resetSignal).toBe(1);
    expect(state.challenge?.focusSignal).toBe(2);
    expect(state.challenge?.instruction).toBe('One quick check before we send');
  });
});

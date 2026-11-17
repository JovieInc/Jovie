import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UIMessage } from 'ai';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OnboardingShell } from './OnboardingShell';

// The frame, chat and bot check are certified on their own; the shell is
// judged on what it adds around them.
vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({ main }: { readonly main: ReactNode }) => (
    <main>{main}</main>
  ),
}));

vi.mock('@/components/organisms/sidebar', () => ({
  SidebarProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/components/features/onboarding/OnboardingChat', () => ({
  OnboardingChat: ({
    initialMessages,
    interactionDisabled,
  }: {
    readonly initialMessages: UIMessage[];
    readonly interactionDisabled?: boolean;
  }) => (
    <section aria-label='Onboarding chat'>
      <ol aria-label='Messages'>
        {initialMessages.map(message => (
          <li key={message.id}>
            {message.parts
              .map(part => (part.type === 'text' ? part.text : ''))
              .join('')}
          </li>
        ))}
      </ol>
      <label htmlFor='shell-cert-draft'>Chat message</label>
      <input id='shell-cert-draft' disabled={interactionDisabled} />
    </section>
  ),
}));

vi.mock('@/components/features/onboarding/OnboardingTurnstile', () => ({
  isOnboardingTurnstilePanelVisible: () => false,
  OnboardingTurnstile: () => null,
}));

const claimState = vi.hoisted(() => ({ value: 'idle' }));
vi.mock('@/components/features/onboarding/useOnboardingClaim', () => ({
  useOnboardingClaim: () => claimState.value,
}));

const restored: UIMessage[] = [
  {
    id: 'm1',
    role: 'user',
    parts: [{ type: 'text', text: 'I want to claim my profile.' }],
  },
  {
    id: 'm2',
    role: 'assistant',
    parts: [{ type: 'text', text: 'Your progress is saved.' }],
  },
];

async function openOptions() {
  await userEvent.click(
    screen.getByRole('button', { name: 'Onboarding options' })
  );
  return screen.findByRole('menu');
}

beforeEach(() => {
  claimState.value = 'idle';
});

describe('OnboardingShell states', () => {
  it('is axe-clean on a first visit and offers only Sign in', async () => {
    const { container } = render(
      <OnboardingShell sessionLabel='cert' onRestart={vi.fn()} />
    );
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
    await expectNoA11yViolations(container);
    await openOptions();
    expect(screen.queryByRole('menuitem', { name: 'Start over' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/signin'
    );
  });

  it('disables the menu actions and the draft while an action is pending', async () => {
    const onRestart = vi.fn();
    const { container } = render(
      <OnboardingShell
        sessionLabel='cert'
        initialMessages={restored}
        onRestart={onRestart}
        actionPending
      />
    );
    expect(screen.getByLabelText('Chat message')).toBeDisabled();
    await expectNoA11yViolations(container);
    await openOptions();
    const restart = screen.getByRole('menuitem', { name: 'Start over' });
    expect(restart).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(restart);
    expect(onRestart).not.toHaveBeenCalled();
  });

  it('announces the account link in words while it saves', async () => {
    claimState.value = 'pending';
    const { container } = render(
      <OnboardingShell sessionLabel='cert' isSignedIn onLogout={vi.fn()} />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Saving this conversation to your account…'
    );
    await expectNoA11yViolations(container);
  });

  it('shows an action failure as an alert beside the kept transcript', async () => {
    const { container } = render(
      <OnboardingShell
        sessionLabel='cert'
        initialMessages={restored}
        onRestart={vi.fn()}
        actionError='We could not start a new conversation. Try again.'
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'We could not start a new conversation. Try again.'
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('restores a transcript and keeps a draft typed into it', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <OnboardingShell
        sessionLabel='cert'
        initialMessages={restored}
        conversationId='conversation-a'
        onRestart={vi.fn()}
      />
    );
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent(
      'Your progress is saved.'
    );
    const draft = screen.getByLabelText('Chat message');
    await user.type(draft, 'Continue');
    expect(draft).toHaveValue('Continue');
    await expectNoA11yViolations(container);
    await openOptions();
    expect(
      screen.getByRole('menuitem', { name: 'Start over' })
    ).not.toHaveAttribute('aria-disabled');
  });

  it('tells a signed-in visitor the claim could not be saved when it fails offline', async () => {
    claimState.value = 'error';
    const { container } = render(
      <OnboardingShell sessionLabel='cert' isSignedIn onLogout={vi.fn()} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't save your request. Refresh this page to try again."
    );
    await expectNoA11yViolations(container);
  });

  it('offers recovery, not a retry, when the profile belongs to another account', async () => {
    claimState.value = 'identity-conflict';
    const onLogout = vi.fn();
    const { container } = render(
      <OnboardingShell sessionLabel='cert' isSignedIn onLogout={onLogout} />
    );
    const toggle = screen.getByRole('button', { name: 'Profile Conflict' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expectNoA11yViolations(container);
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(
      screen.getByRole('button', { name: 'Switch Account' })
    );
    expect(onLogout).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean right to left', async () => {
    const { container } = render(
      <div dir='rtl'>
        <OnboardingShell
          sessionLabel='cert'
          initialMessages={[
            {
              id: 'rtl',
              role: 'assistant',
              parts: [{ type: 'text', text: 'أهلاً، لنكمل من حيث توقفنا.' }],
            },
          ]}
        />
      </div>
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('أهلاً');
    await expectNoA11yViolations(container);
  });
});

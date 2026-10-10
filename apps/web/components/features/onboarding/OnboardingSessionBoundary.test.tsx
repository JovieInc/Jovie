import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingShellProps } from './OnboardingShell';

const mocks = vi.hoisted(() => ({
  auth: {
    isLoaded: true,
    isSignedIn: true,
    userId: 'account-a' as string | null,
    signOut: vi.fn(),
  },
  fetch: vi.fn(),
  shell: vi.fn(),
}));
vi.mock('@/hooks/useJovieAuth', () => ({ useJovieAuth: () => mocks.auth }));
vi.mock('./OnboardingShell', () => ({
  OnboardingShell: (props: OnboardingShellProps) => {
    mocks.shell(props);
    return (
      <div>
        <span data-testid='history'>
          {props.initialMessages
            ?.map(m =>
              m.parts.map(p => (p.type === 'text' ? p.text : '')).join('')
            )
            .join('|')}
        </span>
        <span data-testid='handoff'>{props.starterHandoff?.prompt}</span>
        <button
          type='button'
          onClick={props.onRestart}
          disabled={props.actionPending || props.controlsDisabled}
        >
          Start over
        </button>
        <button type='button' onClick={props.onLogout}>
          Log out
        </button>
        {props.actionError ? <p role='alert'>{props.actionError}</p> : null}
      </div>
    );
  },
}));

import { OnboardingSessionBoundary } from './OnboardingSessionBoundary';

const history: UIMessage[] = [
  {
    id: 'saved-user',
    role: 'user',
    parts: [{ type: 'text', text: 'Saved artist progress' }],
  },
];
function snapshot(
  identityId: string | null = 'account-a',
  messages = history,
  owned = true
) {
  return Response.json({
    identityId,
    conversationId: messages.length ? 'conversation-a' : null,
    owned,
    messages,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.isLoaded = true;
  mocks.auth.isSignedIn = true;
  mocks.auth.userId = 'account-a';
  mocks.fetch.mockResolvedValue(snapshot());
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('onboarding identity boundary', () => {
  it('mounts the chat only after durable history is read and suppresses stale starter intent', async () => {
    let resolve!: (response: Response) => void;
    mocks.fetch.mockReturnValue(
      new Promise<Response>(r => {
        resolve = r;
      })
    );
    render(
      <OnboardingSessionBoundary
        sessionLabel='pending'
        intentId='old-intent'
        starterHandoff={{ kind: 'prompt', prompt: 'Old starter' }}
      />
    );
    expect(mocks.shell).not.toHaveBeenCalled();
    await act(async () => resolve(snapshot()));
    expect(screen.getByTestId('history')).toHaveTextContent(
      'Saved artist progress'
    );
    expect(mocks.shell.mock.lastCall?.[0]).toMatchObject({
      conversationId: 'conversation-a',
      resumeOwnedConversation: true,
      intentId: undefined,
      starterHandoff: null,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toBe('/api/onboarding/conversation');
  });
  it('hides old history immediately on account switch and ignores the former account response', async () => {
    const { rerender } = render(
      <OnboardingSessionBoundary sessionLabel='pending' />
    );
    await screen.findByText('Saved artist progress');
    let resolve!: (response: Response) => void;
    mocks.fetch.mockReturnValue(
      new Promise<Response>(r => {
        resolve = r;
      })
    );
    mocks.auth.userId = 'account-b';
    rerender(<OnboardingSessionBoundary sessionLabel='pending' />);
    expect(screen.queryByText('Saved artist progress')).toBeNull();
    await act(async () => resolve(snapshot('account-a')));
    expect(screen.queryByText('Saved artist progress')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'could not be restored'
    );
  });
  it('does not read or display history until auth initialization finishes', () => {
    mocks.auth.isLoaded = false;
    render(<OnboardingSessionBoundary sessionLabel='pending' />);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.shell).not.toHaveBeenCalled();
  });
  it('keeps an actual empty anonymous entry available for a new homepage handoff', async () => {
    mocks.auth.userId = null;
    mocks.auth.isSignedIn = false;
    mocks.fetch.mockResolvedValue(snapshot(null, [], false));
    render(
      <OnboardingSessionBoundary
        sessionLabel='pending'
        starterHandoff={{ kind: 'prompt', prompt: 'New starter' }}
      />
    );
    expect(await screen.findByText('New starter')).toBeTruthy();
  });
  it('starts over explicitly, removes the URL handoff, and reads the fresh context', async () => {
    mocks.fetch
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(snapshot('account-a', []));
    globalThis.history.replaceState(null, '', '/start?intent_id=old-intent');
    render(
      <OnboardingSessionBoundary
        sessionLabel='pending'
        starterHandoff={{ kind: 'prompt', prompt: 'Old starter' }}
      />
    );
    await screen.findByText('Saved artist progress');
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.getByTestId('history')).toHaveTextContent('')
    );
    expect(globalThis.location.pathname).toBe('/start');
    expect(globalThis.location.search).toBe('');
    expect(mocks.fetch.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        action: 'restart',
        identityId: 'account-a',
        conversationId: 'conversation-a',
      }),
    });
    expect(screen.getByTestId('handoff')).toHaveTextContent('');
  });
  it('keeps history and a retryable error when restart fails', async () => {
    mocks.fetch
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(
        Response.json({ error: 'failed' }, { status: 503 })
      );
    render(<OnboardingSessionBoundary sessionLabel='pending' />);
    await screen.findByText('Saved artist progress');
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not start a new conversation'
    );
    expect(screen.getByTestId('history')).toHaveTextContent(
      'Saved artist progress'
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it('clears the onboarding cookie successfully before supported auth logout', async () => {
    mocks.fetch
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(Response.json({ success: true }));
    render(<OnboardingSessionBoundary sessionLabel='pending' />);
    await screen.findByText('Saved artist progress');
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() =>
      expect(mocks.auth.signOut).toHaveBeenCalledWith({ redirectUrl: '/start' })
    );
    expect(mocks.fetch.mock.calls[1][1].body).toContain('"action":"logout"');
  });
  it('offers restoration retry without fabricating a fresh onboarding flow', async () => {
    mocks.fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(snapshot());
    render(<OnboardingSessionBoundary sessionLabel='pending' />);
    const retry = await screen.findByRole('button', { name: 'Try Again' });
    expect(mocks.shell).not.toHaveBeenCalled();
    fireEvent.click(retry);
    await screen.findByText('Saved artist progress');
  });
});

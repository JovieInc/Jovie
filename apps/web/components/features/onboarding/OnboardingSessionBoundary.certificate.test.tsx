import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { OnboardingShellProps } from './OnboardingShell';

const mocks = vi.hoisted(() => ({
  auth: {
    isLoaded: true,
    isSignedIn: true,
    userId: 'account-a' as string | null,
    signOut: vi.fn(),
  },
  fetch: vi.fn(),
}));
vi.mock('@/hooks/useJovieAuth', () => ({ useJovieAuth: () => mocks.auth }));
// The shell itself is certified on its own; here it only shows what the
// boundary hands it.
vi.mock('./OnboardingShell', () => ({
  ONBOARDING_FRAME_CLASS: 'onboarding-frame',
  OnboardingShell: (props: OnboardingShellProps) => (
    <section aria-label='Onboarding chat'>
      <ol aria-label='Restored messages'>
        {props.initialMessages?.map(message => (
          <li key={message.id}>
            {message.parts
              .map(part => (part.type === 'text' ? part.text : ''))
              .join('')}
          </li>
        ))}
      </ol>
      <label htmlFor='boundary-draft'>Message</label>
      <input id='boundary-draft' />
    </section>
  ),
}));

import { OnboardingSessionBoundary } from './OnboardingSessionBoundary';

const LONG_TEXT =
  'I release melodic techno under two aliases, tour across Europe every spring, and want one page that links the label store, the Bandsintown dates and the newsletter without losing any of it.';

function turn(id: string, role: 'user' | 'assistant', text: string): UIMessage {
  return { id, role, parts: [{ type: 'text', text }] };
}

function snapshot(messages: UIMessage[], identityId = 'account-a') {
  return Response.json({
    identityId,
    conversationId: messages.length ? 'conversation-a' : null,
    owned: true,
    messages,
  });
}

function renderBoundary(dir?: 'rtl') {
  return render(
    <div dir={dir}>
      <OnboardingSessionBoundary sessionLabel='cert' />
    </div>
  );
}

const restoreMarker = () => screen.getByTestId('onboarding-session-boundary');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.isLoaded = true;
  mocks.auth.isSignedIn = true;
  mocks.auth.userId = 'account-a';
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('OnboardingSessionBoundary states', () => {
  it('announces the restore while history loads and stays axe-clean', async () => {
    mocks.fetch.mockReturnValue(new Promise<Response>(() => {}));
    const { container } = renderBoundary();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Restoring your conversation…'
    );
    expect(restoreMarker()).toHaveAttribute('data-restore-state', 'restoring');
    await expectNoA11yViolations(container);
  });

  it('holds the restore screen until auth settles, without reading history', async () => {
    mocks.auth.isLoaded = false;
    mocks.auth.userId = null;
    const { container } = renderBoundary();
    expect(restoreMarker()).toHaveAttribute('data-auth-state', 'loading');
    expect(mocks.fetch).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('mounts an empty chat when there is no history', async () => {
    mocks.fetch.mockResolvedValue(snapshot([]));
    const { container } = renderBoundary();
    expect(
      await screen.findByRole('region', { name: 'Onboarding chat' })
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('mounts a long restored transcript whole', async () => {
    const messages = Array.from({ length: 12 }, (_, index) =>
      turn(
        `m${index}`,
        index % 2 ? 'assistant' : 'user',
        `${LONG_TEXT} (${index})`
      )
    );
    mocks.fetch.mockResolvedValue(snapshot(messages));
    const { container } = renderBoundary();
    expect(await screen.findAllByRole('listitem')).toHaveLength(12);
    expect(screen.getAllByRole('listitem')[11]).toHaveTextContent('(11)');
    await expectNoA11yViolations(container);
  });

  it('shows a retryable failure when the server errors, and retries on request', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const { container } = renderBoundary();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your conversation could not be restored.'
    );
    expect(restoreMarker()).toHaveAttribute('data-restore-error', 'status:500');
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeEnabled();
    await expectNoA11yViolations(container);

    mocks.fetch.mockResolvedValueOnce(snapshot([turn('m1', 'user', 'Hi')]));
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByRole('listitem')).toHaveTextContent('Hi');
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('marks an offline read as a network failure', async () => {
    mocks.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = renderBoundary();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not be restored'
    );
    expect(restoreMarker()).toHaveAttribute(
      'data-restore-error',
      'restore-network'
    );
    await expectNoA11yViolations(container);
  });

  it('fails closed when the server refuses the history', async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 403 }));
    const { container } = renderBoundary();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not be restored'
    );
    expect(restoreMarker()).toHaveAttribute('data-restore-error', 'status:403');
    expect(
      screen.queryByRole('region', { name: 'Onboarding chat' })
    ).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps a visitor without an account to Try Again only', async () => {
    mocks.auth.isSignedIn = false;
    mocks.auth.userId = null;
    mocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));
    const { container } = renderBoundary();
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Log Out' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('restores right to left, keeping a draft typed after the restore', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(
      snapshot([turn('m1', 'assistant', 'أهلاً، لنكمل من حيث توقفنا.')])
    );
    const { container } = renderBoundary('rtl');
    expect(await screen.findByRole('listitem')).toHaveTextContent('أهلاً');
    const draft = screen.getByLabelText('Message');
    await user.type(draft, 'مرحبا');
    expect(draft).toHaveValue('مرحبا');
    await expectNoA11yViolations(container);
  });
});

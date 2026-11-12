import '../../../styles/system-b-app.css';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { UIMessage } from 'ai';
import { useLayoutEffect, useState } from 'react';
import { expect, fn, within } from 'storybook/test';
import { createSignedInApiMock } from '../../../.storybook/signed-in-session';
import { JovieAuthValuesProvider } from '../../../hooks/useJovieAuth';
import { OnboardingShell } from './OnboardingShell';

type FixtureWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

const restoredTurns: UIMessage[] = [
  {
    id: 'state-user-turn',
    role: 'user',
    parts: [{ type: 'text', text: 'I want to claim my profile.' }],
  },
  {
    id: 'state-assistant-turn',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: 'Your progress is saved. We can continue here.',
      },
    ],
  },
];

/**
 * A signed-in Better Auth session, registered on the preview's pinned
 * /api/* interceptor so the shell's account claim runs. No live auth.
 */
function SignedInFrame({ children }: Readonly<{ children: React.ReactNode }>) {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const target = window as FixtureWindow;
    const previous = target.__jovieApiMock;
    target.__jovieApiMock = createSignedInApiMock();
    setReady(true);
    return () => {
      target.__jovieApiMock = previous;
    };
  }, []);
  return (
    <div className='flex h-dvh flex-col'>
      {ready ? (
        <JovieAuthValuesProvider>{children}</JovieAuthValuesProvider>
      ) : null}
    </div>
  );
}

const withSignedInFrame: Decorator = Story => (
  <SignedInFrame>
    <Story />
  </SignedInFrame>
);

/** Answers POST /api/onboarding/claim for this story only. */
function stubClaim(answer: () => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === '/api/onboarding/claim') return answer();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

const meta = {
  title: 'Features/Onboarding/OnboardingShellStates',
  component: OnboardingShell,
  parameters: {
    layout: 'fullscreen',
    chromatic: { viewports: [390, 1024] },
    docs: {
      description: {
        component:
          'One story per state the /start shell reaches. Requests are answered locally; nothing reaches auth, the model or the claim service.',
      },
    },
  },
  args: {
    sessionLabel: 'states',
    isSignedIn: false,
  },
} satisfies Meta<typeof OnboardingShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** First visit: no transcript, so there is nothing to start over. */
export const EmptyFirstVisit: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Onboarding options' })
    ).toBeVisible();
  },
};

/** A restart or logout is in flight: the menu actions stay disabled. */
export const LoadingActionPending: Story = {
  args: {
    initialMessages: restoredTurns,
    conversationId: '3d5e4576-72f4-4fc5-9702-a28bdcd76020',
    onRestart: fn(),
    actionPending: true,
  },
};

export const ErrorActionFailed: Story = {
  args: {
    initialMessages: restoredTurns,
    conversationId: '3d5e4576-72f4-4fc5-9702-a28bdcd76020',
    onRestart: fn(),
    actionError: 'We could not start a new conversation. Try again.',
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
      'We could not start a new conversation. Try again.'
    );
  },
};

/** A restored transcript with no profile preview yet. */
export const PartialRestoredConversation: Story = {
  args: {
    initialMessages: restoredTurns,
    conversationId: '3d5e4576-72f4-4fc5-9702-a28bdcd76020',
    onRestart: fn(),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        'Your progress is saved. We can continue here.'
      )
    ).toBeVisible();
  },
};

/** Signed in, but the account claim cannot reach the server. */
export const OfflineClaimFailed: Story = {
  args: { isSignedIn: true, onLogout: fn() },
  decorators: [withSignedInFrame],
  beforeEach: stubClaim(async () => {
    throw new TypeError('Failed to fetch');
  }),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('alert')
    ).toHaveTextContent("We couldn't save your request.");
  },
};

/** The artist already belongs to another account: recovery, not a retry. */
export const PermissionDeniedProfileConflict: Story = {
  args: { isSignedIn: true, onLogout: fn() },
  decorators: [withSignedInFrame],
  beforeEach: stubClaim(async () =>
    Response.json({ errorCode: 'SPOTIFY_IDENTITY_CONFLICT' }, { status: 409 })
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('button', {
        name: 'Profile Conflict',
      })
    ).toBeVisible();
  },
};

export const RtlVisitor: Story = {
  decorators: [
    Story => (
      <div dir='rtl' className='flex h-dvh flex-col'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Onboarding options' })
    ).toBeVisible();
  },
};

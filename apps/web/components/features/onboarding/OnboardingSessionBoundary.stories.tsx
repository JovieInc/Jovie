import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { useLayoutEffect, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { createSignedInApiMock } from '../../../.storybook/signed-in-session';
import { JovieAuthValuesProvider } from '../../../hooks/useJovieAuth';
import { OnboardingSessionBoundary } from './OnboardingSessionBoundary';

type FixtureWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

/**
 * What GET /api/onboarding/conversation answers in a story: the saved
 * transcript (`resumed`), a 503 (`unavailable`), no history (`empty`), a
 * long transcript (`long`) or a read that never settles (`pending`).
 */
type HistoryMode = 'resumed' | 'unavailable' | 'empty' | 'long' | 'pending';

const savedTurns = [
  {
    id: 'saved-user-turn',
    role: 'user',
    parts: [{ type: 'text', text: 'I want to claim my profile.' }],
  },
  {
    id: 'saved-assistant-turn',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: 'Your progress is saved. We can continue here.',
      },
    ],
  },
];

const longTurns = Array.from({ length: 10 }, (_, index) => ({
  id: `long-turn-${index}`,
  role: index % 2 ? 'assistant' : 'user',
  parts: [
    {
      type: 'text',
      text:
        index % 2
          ? `Noted. I saved the label store, the spring tour dates and the newsletter link, and I will keep them together on one page (step ${index}).`
          : `I release melodic techno under two aliases and tour across Europe every spring, so I need one page that links everything without losing any of it (step ${index}).`,
    },
  ],
}));

// Fixture-only endpoints: no live auth, model, profile, or payment writes.
function ResumeFixture({
  children,
  mode,
}: Readonly<{ children: React.ReactNode; mode: HistoryMode }>) {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const target = window as FixtureWindow;
    const previous = target.__jovieApiMock;
    const signedIn = createSignedInApiMock();
    let restarted = false;
    target.__jovieApiMock = request => {
      if (request.url.pathname === '/api/onboarding/conversation') {
        if (request.init?.method === 'POST') {
          restarted = true;
          return Response.json({ ok: true });
        }
        if (mode === 'unavailable') return new Response(null, { status: 503 });
        if (mode === 'pending') return new Promise<Response>(() => {});
        const messages =
          restarted || mode === 'empty'
            ? []
            : mode === 'long'
              ? longTurns
              : savedTurns;
        return Response.json({
          identityId: 'story-user',
          conversationId:
            mode === 'empty'
              ? null
              : restarted
                ? '3d5e4576-72f4-4fc5-9702-a28bdcd76021'
                : '3d5e4576-72f4-4fc5-9702-a28bdcd76020',
          owned: true,
          messages,
        });
      }
      return signedIn(request);
    };
    setReady(true);
    return () => {
      target.__jovieApiMock = previous;
    };
  }, [mode]);
  return (
    <div className='flex h-dvh flex-col'>
      {ready ? (
        <JovieAuthValuesProvider>{children}</JovieAuthValuesProvider>
      ) : null}
    </div>
  );
}

const withResumeFixture: Decorator = (Story, context) => (
  <ResumeFixture
    mode={
      context.parameters.historyUnavailable === true
        ? 'unavailable'
        : ((context.parameters.historyMode as HistoryMode | undefined) ??
          'resumed')
    }
  >
    <Story />
  </ResumeFixture>
);

/**
 * Fails the history read for this story only: the stub answers
 * /api/onboarding/conversation and passes every other request on.
 */
function failHistoryRead(fail: () => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (
        url.pathname === '/api/onboarding/conversation' &&
        (!init?.method || init.method === 'GET')
      )
        return fail();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

async function expectRestoreFailure(canvasElement: HTMLElement, code: string) {
  const canvas = within(canvasElement);
  await expect(
    await canvas.findByText('Your conversation could not be restored.')
  ).toBeVisible();
  await expect(canvas.getByRole('button', { name: 'Try Again' })).toBeVisible();
  await expect(
    canvas.getByTestId('onboarding-session-boundary')
  ).toHaveAttribute('data-restore-error', code);
}

const meta = {
  title: 'Features/Onboarding/OnboardingSessionBoundary',
  component: OnboardingSessionBoundary,
  decorators: [withResumeFixture],
  parameters: {
    layout: 'fullscreen',
    chromatic: { viewports: [390, 1024] },
  },
  args: { sessionLabel: 'saved', isSignedIn: true },
} satisfies Meta<typeof OnboardingSessionBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Resumed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Your progress is saved. We can continue here.')
    ).toBeVisible();
    // Recovery actions live in the canonical overflow menu (JOV-7774);
    // its content portals to the document body, not the canvas.
    await userEvent.click(
      canvas.getByRole('button', { name: 'Onboarding options' })
    );
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      body.getByRole('menuitem', { name: 'Start over' })
    ).toBeVisible();
    await expect(body.getByRole('menuitem', { name: 'Log out' })).toBeVisible();
    await expect(body.queryByRole('menuitem', { name: 'Sign in' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await expect(
      canvas.getByRole('button', { name: 'Onboarding options' })
    ).toHaveFocus();
  },
};

export const StartOver: Story = {
  play: async context => {
    await Resumed.play?.(context);
    const canvas = within(context.canvasElement);
    const body = within(context.canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Onboarding options' })
    );
    await userEvent.click(body.getByRole('menuitem', { name: 'Start over' }));
    // Restarting discards the restored transcript: the saved-progress banner
    // disappears once the boundary remounts the fresh conversation.
    await waitFor(() =>
      expect(
        canvas.queryByText('Your progress is saved. We can continue here.')
      ).toBeNull()
    );
    // The restarted conversation still exists (a fresh id), so Start over
    // stays offered and enabled.
    await userEvent.click(
      canvas.getByRole('button', { name: 'Onboarding options' })
    );
    await expect(
      body.getByRole('menuitem', { name: 'Start over' })
    ).not.toHaveAttribute('aria-disabled');
    await userEvent.keyboard('{Escape}');
  },
};

export const HistoryUnavailable: Story = {
  parameters: { historyUnavailable: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Your conversation could not be restored.')
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Try Again' })
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Log Out' })).toBeVisible();
  },
};

export const LoadingRestore: Story = {
  parameters: { historyMode: 'pending' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Restoring your conversation…')
    ).toBeVisible();
    await expect(
      canvas.getByTestId('onboarding-session-boundary')
    ).toHaveAttribute('data-restore-state', 'restoring');
  },
};

export const EmptyHistory: Story = {
  parameters: { historyMode: 'empty' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: 'Onboarding options' })
    ).toBeVisible();
    await expect(
      canvas.queryByText('Your progress is saved. We can continue here.')
    ).toBeNull();
  },
};

export const ErrorRestoreFailed: Story = {
  beforeEach: failHistoryRead(async () => new Response(null, { status: 500 })),
  play: async ({ canvasElement }) => {
    await expectRestoreFailure(canvasElement, 'status:500');
  },
};

export const LongTranscript: Story = {
  parameters: { historyMode: 'long' },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/\(step 9\)/)
    ).toBeInTheDocument();
  },
};

export const OfflineRestore: Story = {
  beforeEach: failHistoryRead(async () => {
    throw new TypeError('Failed to fetch');
  }),
  play: async ({ canvasElement }) => {
    await expectRestoreFailure(canvasElement, 'restore-network');
  },
};

/** The server refuses this identity's history: fail closed, show nothing. */
export const PermissionDeniedHistory: Story = {
  beforeEach: failHistoryRead(async () => new Response(null, { status: 403 })),
  play: async ({ canvasElement }) => {
    await expectRestoreFailure(canvasElement, 'status:403');
    await expect(
      within(canvasElement).queryByText(
        'Your progress is saved. We can continue here.'
      )
    ).toBeNull();
  },
};

export const RtlResumed: Story = {
  decorators: [
    Story => (
      <div dir='rtl' className='flex min-h-0 flex-1 flex-col'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        'Your progress is saved. We can continue here.'
      )
    ).toBeVisible();
  },
};

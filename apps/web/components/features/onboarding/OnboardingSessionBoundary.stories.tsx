import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { useLayoutEffect, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { createSignedInApiMock } from '../../../.storybook/signed-in-session';
import { JovieAuthValuesProvider } from '../../../hooks/useJovieAuth';
import { OnboardingSessionBoundary } from './OnboardingSessionBoundary';

type FixtureWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

// Fixture-only endpoints: no live auth, model, profile, or payment writes.
function ResumeFixture({
  children,
  unavailable,
}: Readonly<{ children: React.ReactNode; unavailable: boolean }>) {
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
        if (unavailable) return new Response(null, { status: 503 });
        return Response.json({
          identityId: 'story-user',
          conversationId: restarted
            ? '3d5e4576-72f4-4fc5-9702-a28bdcd76021'
            : '3d5e4576-72f4-4fc5-9702-a28bdcd76020',
          owned: true,
          messages: restarted
            ? []
            : [
                {
                  id: 'saved-user-turn',
                  role: 'user',
                  parts: [
                    { type: 'text', text: 'I want to claim my profile.' },
                  ],
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
              ],
        });
      }
      return signedIn(request);
    };
    setReady(true);
    return () => {
      target.__jovieApiMock = previous;
    };
  }, [unavailable]);
  return (
    <div className='flex h-dvh flex-col'>
      {ready ? (
        <JovieAuthValuesProvider>{children}</JovieAuthValuesProvider>
      ) : null}
    </div>
  );
}

const withResumeFixture: Decorator = (Story, context) => (
  <ResumeFixture unavailable={context.parameters.historyUnavailable === true}>
    <Story />
  </ResumeFixture>
);

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
    await expect(
      canvas.getByRole('button', { name: 'Start Over' })
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Log Out' })).toBeVisible();
    await expect(canvas.queryByRole('link', { name: 'Sign in' })).toBeNull();
  },
};

export const StartOver: Story = {
  play: async context => {
    await Resumed.play?.(context);
    const canvas = within(context.canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Start Over' }));
    await expect(
      await canvas.findByRole('button', { name: 'Start Over' })
    ).toBeEnabled();
    await expect(
      canvas.queryByText('Your progress is saved. We can continue here.')
    ).toBeNull();
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

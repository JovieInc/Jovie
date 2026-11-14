import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { OnboardingFormWrapper } from './OnboardingFormWrapper';

/** Replace the availability check (GET /api/handle/check) for one story. */
function stubHandleCheck(next: typeof globalThis.fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = next;
  return () => {
    globalThis.fetch = original;
  };
}

const json = (body: object) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

async function typeHandle(canvasElement: HTMLElement, value: string) {
  const canvas = within(canvasElement);
  await userEvent.type(
    canvas.getByRole('textbox', { name: 'Claim Your Handle' }),
    value
  );
  return canvas;
}

/**
 * OnboardingFormWrapper picks the handle-only form for new users and the
 * deferred full form for a resume flow. Handle checks hit /api/handle/check,
 * which the stories stub; onboarding server actions use the Storybook alias mocks.
 */
const meta = {
  title: 'Dashboard/Organisms/OnboardingFormWrapper States',
  component: OnboardingFormWrapper,
  parameters: {
    layout: 'centered',
    nextjs: { appDirectory: true },
  },
  args: {
    userId: 'story-user-1',
    userEmail: 'story@example.com',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-md'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OnboardingFormWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: a resume flow shows the onboarding loading shell until the full form chunk arrives. */
export const LoadingResumeFlow: Story = {
  args: {
    initialHandle: 'story-handle',
    initialDisplayName: 'Story User',
    initialProfileId: 'story-profile',
    initialResumeStep: 'spotify',
    assumeInitialHandleAvailable: true,
  },
};

/** Empty: a new user with no handle yet. */
export const EmptyNewUser: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('textbox', { name: 'Claim Your Handle' })
    ).toHaveValue('');
  },
};

/** Error: the handle the user types is already taken. */
export const ErrorHandleTaken: Story = {
  beforeEach: () =>
    stubHandleCheck(async () =>
      json({ available: false, error: 'Handle already taken' })
    ),
  play: async ({ canvasElement }) => {
    const canvas = await typeHandle(canvasElement, 'takenname');
    await waitFor(
      () => expect(canvas.getByTestId('handle-unavailable')).toBeVisible(),
      { timeout: 3000 }
    );
  },
};

/** Partial: a handle seeded from sign-up that the server already vouched for. */
export const PartialSeededHandle: Story = {
  args: {
    initialHandle: 'story-handle',
    initialDisplayName: 'Story User',
    assumeInitialHandleAvailable: true,
  },
};

/** Long content: a long seeded handle and display name. */
export const LongContentSeededHandle: Story = {
  args: {
    initialHandle: 'theextraordinarilylongartistname',
    initialDisplayName:
      'The Extraordinarily Long Artist Name And The Midnight Orchestra',
    assumeInitialHandleAvailable: true,
  },
};

/** Offline: the availability check cannot reach the server, so Continue stays disabled. */
export const OfflineHandleCheck: Story = {
  beforeEach: () =>
    stubHandleCheck(async () => {
      throw new TypeError('Failed to fetch');
    }),
  play: async ({ canvasElement }) => {
    const canvas = await typeHandle(canvasElement, 'offlinename');
    await expect(canvas.getByRole('button', { name: 'Continue' })).toBeDisabled();
  },
};

/** Right-to-left: the onboarding form inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl' className='w-full max-w-md'>
        <Story />
      </div>
    ),
  ],
};

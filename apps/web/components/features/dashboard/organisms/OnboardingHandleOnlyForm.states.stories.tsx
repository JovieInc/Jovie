import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { OnboardingHandleOnlyForm } from './OnboardingHandleOnlyForm';

/** Replace the availability check (GET /api/handle/check) for one story. */
function stubHandleCheck(next: typeof globalThis.fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = next;
  return () => {
    globalThis.fetch = original;
  };
}

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
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
 * The first onboarding step: claim a handle. Availability is checked against
 * /api/handle/check, which each story stubs; onboarding server actions use
 * the Storybook alias mocks.
 */
const meta = {
  title: 'Features/Dashboard/Organisms/OnboardingHandleOnlyForm States',
  component: OnboardingHandleOnlyForm,
  parameters: { layout: 'centered' },
  args: {
    isHydrated: true,
    userId: 'mock-user-id',
  },
} satisfies Meta<typeof OnboardingHandleOnlyForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no handle yet, so Continue stays disabled with its reason. */
export const EmptyHandle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Continue' })
    ).toBeDisabled();
  },
};

/** Error: the handle is already taken. */
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
    initialHandle: 'sashawaves',
    assumeInitialHandleAvailable: true,
  },
};

/** Long content: a long handle checked as available. */
export const LongContentHandle: Story = {
  beforeEach: () => stubHandleCheck(async () => json({ available: true })),
  play: async ({ canvasElement }) => {
    await typeHandle(canvasElement, 'theextraordinarilylongartistname');
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
    await expect(
      canvas.getByRole('button', { name: 'Continue' })
    ).toBeDisabled();
  },
};

/** Right-to-left: the handle step inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { WaitlistIntakeChat } from './WaitlistIntakeChat';

const ANSWERS = [
  'artist',
  'https://instagram.com/artist',
  null,
  null,
  'A new single rollout',
  'Keeping assets organized',
  'Launch with less manual follow-up',
] as const;

async function answerEverything(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  for (const [index, answer] of ANSWERS.entries()) {
    if (answer === null) {
      await userEvent.click(canvas.getByRole('button', { name: 'Skip' }));
      continue;
    }
    await userEvent.type(canvas.getByRole('textbox'), answer);
    const final = index === ANSWERS.length - 1;
    await userEvent.click(
      canvas.getByRole('button', {
        name: final ? 'Save request' : 'Send answer',
      })
    );
  }
  return canvas;
}

function withFetch(stub: typeof fetch, run: () => Promise<void>) {
  return async () => {
    const original = globalThis.fetch;
    globalThis.fetch = stub;
    try {
      await run();
    } finally {
      globalThis.fetch = original;
    }
  };
}

const meta = {
  title: 'Features/Waitlist/WaitlistIntakeChat/States',
  component: WaitlistIntakeChat,
  parameters: { layout: 'fullscreen' },
  args: { userEmail: 'artist@example.com' },
} satisfies Meta<typeof WaitlistIntakeChat>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the final answer is sent and the request never settles. */
export const LoadingSaving: Story = {
  play: ({ canvasElement }) =>
    withFetch(
      (() => new Promise<Response>(() => {})) as typeof fetch,
      async () => {
        const canvas = await answerEverything(canvasElement);
        await expect(
          await canvas.findByText('Saving Your Request')
        ).toBeVisible();
      }
    )(),
};

/** Empty: the first question with nothing answered and no saved context. */
export const EmptyFirstQuestion: Story = {};

/** Error: a short acknowledgement is rejected with an inline message. */
export const ErrorShortAnswer: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox'), 'k');
    await userEvent.click(canvas.getByRole('button', { name: 'Send answer' }));
    await expect(await canvas.findByRole('alert')).toBeVisible();
  },
};

/** Partial: two answers are saved and the context panel fills in. */
export const PartialTwoAnswers: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox'), 'artist');
    await userEvent.click(canvas.getByRole('button', { name: 'Send answer' }));
    await userEvent.type(
      canvas.getByRole('textbox'),
      'https://instagram.com/artist'
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Send answer' }));
  },
};

/** Long content: a very long signed-in email truncates in the header. */
export const LongContentEmail: Story = {
  args: {
    userEmail:
      'an.artist.with.a.very.long.name.and.a.longer.mailbox@subdomain.example-music-label.com',
  },
};

/** Offline: the final request fails to reach the network. */
export const OfflineSubmit: Story = {
  play: ({ canvasElement }) =>
    withFetch(
      (() => Promise.reject(new TypeError('offline'))) as typeof fetch,
      async () => {
        const canvas = await answerEverything(canvasElement);
        await expect(await canvas.findByRole('alert')).toBeVisible();
      }
    )(),
};

/** Permission denied: the intake is rate limited and the answers stay put. */
export const PermissionDeniedRateLimited: Story = {
  play: ({ canvasElement }) =>
    withFetch(
      (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: false,
              outcome: 'rate_limited',
              code: 'rate_limited',
              error: 'Too many onboarding attempts. Please try again later.',
            }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
          )
        )) as typeof fetch,
      async () => {
        await answerEverything(canvasElement);
      }
    )(),
};

/** Right to left: the chat mirrors under an Arabic document direction. */
export const RtlOverflow: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { AskJovieMark } from './AskJovie';

/**
 * State coverage for the Ask Jovie popover. Each story opens the popover from
 * its trigger so the panel states render in the canvas.
 */
const meta = {
  title: 'AskJovie/AskJovieMark States',
  component: AskJovieMark,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['pathname', 'disabled'] },
  },
  decorators: [
    function AskJovieStatesFrame(Story) {
      return (
        <div className='flex min-h-96 items-start gap-4 bg-surface-1 p-6'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof AskJovieMark>;

export default meta;
type Story = StoryObj<typeof meta>;

async function openPanel(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByTestId('ask-jovie-trigger'));
  return within(document.body);
}

/** Empty: no conversation yet, so the suggested prompts show. */
export const EmptySuggestions: Story = {
  play: async ({ canvasElement }) => {
    const screen = await openPanel(canvasElement);
    await expect(
      await screen.findByTestId('ask-jovie-suggestions')
    ).toBeVisible();
  },
};

/** Partial: one suggestion sent, so the reply replaces the suggestions. */
export const PartialConversation: Story = {
  play: async ({ canvasElement }) => {
    const screen = await openPanel(canvasElement);
    await userEvent.click(await screen.findByText('Request a feature'));
    await expect(await screen.findByTestId('ask-jovie-messages')).toBeVisible();
  },
};

/** Long content: a long message wraps and scrolls inside the panel. */
export const LongContentMessage: Story = {
  play: async ({ canvasElement }) => {
    const screen = await openPanel(canvasElement);
    await userEvent.type(
      await screen.findByLabelText('Message Jovie'),
      'Create a new smart link for my upcoming single, schedule it for Friday, add every streaming service and the pre-save page, and remind me to post it on every social channel the day before it goes live{enter}'
    );
    await expect(await screen.findByTestId('ask-jovie-messages')).toBeVisible();
  },
};

/** Offline: the feedback request cannot reach the network, the chat still answers. */
export const OfflineFeedbackNotSent: Story = {
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new TypeError('Network offline'));
    return () => {
      globalThis.fetch = original;
    };
  },
  play: async ({ canvasElement }) => {
    const screen = await openPanel(canvasElement);
    await userEvent.click(await screen.findByText('Send feedback'));
    await expect(await screen.findByTestId('ask-jovie-messages')).toBeVisible();
  },
};

/** Right-to-left: the panel mirrors its gutters in an RTL page. */
export const RtlPanel: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const screen = await openPanel(canvasElement);
    await expect(await screen.findByTestId('ask-jovie-panel')).toBeVisible();
  },
};

import '@/app/globals.css';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import {
  AgentRoomComposer,
  type AgentRoomComposerState,
} from './AgentRoomComposer';

/**
 * Rendered states of the agent room composer. The default and failed-send
 * stories live in AgentRoomComposer.stories.tsx.
 */
const meta = {
  title: 'Features/AgentRoom/AgentRoomComposer/States',
  component: AgentRoomComposer,
  parameters: { layout: 'padded' },
  args: {
    agents: [
      { id: 'summer', name: 'Summer' },
      { id: 'chloe', name: 'Chloe' },
    ],
    action: async (): Promise<AgentRoomComposerState> => ({
      status: 'sent',
      message: 'Posted in JOV-12296.',
    }),
  },
} satisfies Meta<typeof AgentRoomComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

async function fillAndSend(canvasElement: HTMLElement, text: string) {
  const canvas = within(canvasElement);
  await userEvent.selectOptions(
    canvas.getByRole('combobox', { name: /^To/ }),
    'chloe'
  );
  await userEvent.type(canvas.getByLabelText('Message'), text);
  await userEvent.click(canvas.getByRole('button', { name: 'Send' }));
}

// The pending send settles when the story unmounts: React entangles pending
// async transitions, so a send left open would hold later stories' sends.
let settlePendingSend: (() => void) | null = null;

/** Loading: a send in flight disables the button and labels it Sending. */
export const LoadingSend: Story = {
  args: {
    action: () =>
      new Promise<AgentRoomComposerState>(resolve => {
        settlePendingSend = () => resolve({ status: 'idle' });
      }),
  },
  beforeEach: () => () => {
    settlePendingSend?.();
    settlePendingSend = null;
  },
  play: async ({ canvasElement }) => {
    await fillAndSend(canvasElement, 'status?');
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: 'Sending' })
    ).toBeDisabled();
  },
};

/** Empty: no agent has a thread yet, so only the placeholder option shows. */
export const EmptyAgents: Story = {
  args: { agents: [] },
};

/** Long content: long agent names, a long message and a long result line. */
export const LongContentMessage: Story = {
  args: {
    agents: [
      {
        id: 'release-ops',
        name: 'Release operations agent for the spring catalog campaign',
      },
      { id: 'chloe', name: 'Chloe' },
    ],
    action: async (): Promise<AgentRoomComposerState> => ({
      status: 'sent',
      message:
        'Posted in JOV-12296. The agent will reply in the Linear thread once it has checked every release in the spring catalog campaign.',
    }),
  },
  play: async ({ canvasElement }) => {
    await fillAndSend(
      canvasElement,
      'Please check every release in the spring catalog campaign and confirm the artwork, credits and pre-save links are ready before Friday.'
    );
  },
};

/** Offline: the send could not reach Linear, and the typed message stays. */
export const OfflineSend: Story = {
  args: {
    action: async (): Promise<AgentRoomComposerState> => ({
      status: 'error',
      message:
        'You are offline. The message is kept; send it again when you reconnect.',
    }),
  },
  play: async ({ canvasElement }) => {
    await fillAndSend(canvasElement, 'status?');
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('status')).toHaveTextContent(
      'You are offline.'
    );
    await expect(canvas.getByLabelText('Message')).toHaveValue('status?');
  },
};

const withRtl: Decorator = function WithRtl(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** RTL: Arabic agent names and placeholder text in a right-to-left page. */
export const RtlComposer: Story = {
  decorators: [withRtl],
  args: {
    agents: [
      { id: 'layla', name: 'ليلى' },
      { id: 'omar', name: 'عمر' },
    ],
  },
};

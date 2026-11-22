import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import { AskJovieWidget } from './AskJovieWidget';

const meta = {
  title: 'Features/AskJovie/AskJovieWidget',
  component: AskJovieWidget,
  parameters: {
    layout: 'fullscreen',
    // `disabled` exists only on internal pending buttons, not a public prop.
    jovie: { uncoveredProps: ['disabled'] },
  },
  args: {
    username: 'timwhite',
    artistName: 'Tim White',
  },
} satisfies Meta<typeof AskJovieWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Collapsed trigger: floating icon in the bottom-right corner. */
export const Collapsed: Story = {};

/** Open conversation surface with greeting, suggestions, and intents. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.ownerDocument.body.querySelector(
      'button[aria-label^="Ask Jovie about"]'
    );
    (trigger as HTMLButtonElement | null)?.click();
  },
};

function swapFetch(next: typeof fetch) {
  globalThis.fetch = next;
}

function withHangingFetch(Story: () => React.JSX.Element) {
  swapFetch(() => new Promise<Response>(() => {}));
  return <Story />;
}

function withFailingFetch(Story: () => React.JSX.Element) {
  swapFetch(() => Promise.reject(new Error('Server error')));
  return <Story />;
}

function withOfflineFetch(Story: () => React.JSX.Element) {
  swapFetch(() => Promise.reject(new TypeError('Failed to fetch')));
  return <Story />;
}

function withUnansweredFetch(Story: () => React.JSX.Element) {
  swapFetch(async () => Response.json({ answered: false }));
  return <Story />;
}

async function openAndAsk(
  { canvasElement }: { canvasElement: HTMLElement },
  question: string
) {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(
    await body.findByRole('button', { name: /^Ask Jovie about/ })
  );
  const composer = await body.findByPlaceholderText(/^Ask about/);
  await userEvent.type(composer, `${question}{Enter}`);
}

/** Open with the greeting only: nothing asked yet. */
export const EmptyConversation: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole('button', { name: /^Ask Jovie about/ })
    );
  },
};

/** Loading: a question is in flight and the composer is disabled. */
export const LoadingAwaitingAnswer: Story = {
  decorators: [withHangingFetch],
  play: ctx => openAndAsk(ctx, 'What is the next show?'),
};

/** Error: the request fails and Jovie apologises in the thread. */
export const ErrorRequestFailed: Story = {
  decorators: [withFailingFetch],
  play: ctx => openAndAsk(ctx, 'What is the next show?'),
};

/** Offline: the network is unreachable. */
export const OfflineRequestFails: Story = {
  decorators: [withOfflineFetch],
  play: ctx => openAndAsk(ctx, 'What is the next show?'),
};

/** Partial: no answer on file, so the visitor can send the question on. */
export const PartialUnansweredQuestion: Story = {
  decorators: [withUnansweredFetch],
  play: ctx => openAndAsk(ctx, 'What is on the rider?'),
};

/** Long content: a long question and a long artist name. */
export const LongContentQuestion: Story = {
  args: {
    artistName: 'The Extraordinarily Long Named Midnight Orchestra And Friends',
  },
  decorators: [withUnansweredFetch],
  play: ctx =>
    openAndAsk(
      ctx,
      'Could you tell me everything about the upcoming tour including every city, every venue, the support acts and the ticket on-sale times?'
    ),
};

/** Right to left: Arabic name and question. */
export const RtlQuestion: Story = {
  args: { artistName: 'فرقة منتصف الليل' },
  decorators: [withUnansweredFetch],
  play: ctx => openAndAsk(ctx, 'متى الحفلة القادمة؟'),
};

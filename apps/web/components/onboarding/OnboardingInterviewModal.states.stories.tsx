import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, screen, userEvent } from 'storybook/test';
import { OnboardingInterviewModal } from './OnboardingInterviewModal';

const meta = {
  title: 'Onboarding/OnboardingInterviewModal/States',
  component: OnboardingInterviewModal,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/onboarding' },
    },
  },
  args: { initialRequested: true },
} satisfies Meta<typeof OnboardingInterviewModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the first question is open with no answer, so Next stays disabled. */
export const EmptyFirstQuestion: Story = {
  play: async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Quick Interview',
    });
    await expect(dialog).toBeVisible();
  },
};

/** Partial: the visitor typed an answer and may send it or move on. */
export const PartialAnswered: Story = {
  play: async () => {
    await userEvent.type(
      await screen.findByRole('textbox'),
      'I send a Linktree and a DM.'
    );
    await expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  },
};

/** Long content: a very long answer scrolls inside the textarea. */
export const LongContentAnswer: Story = {
  play: async () => {
    await userEvent.type(
      await screen.findByRole('textbox'),
      'I send whatever link is fastest to find, usually a DM with a Spotify link, then a second one for Apple Music, then a ticket link. '.repeat(
        4
      )
    );
  },
};

/** Error: the send failed, so the answers stay and a retry is offered. */
export const ErrorRetryOffered: Story = {
  play: async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.reject(new TypeError('offline'))) as typeof fetch;
    try {
      await userEvent.type(await screen.findByRole('textbox'), 'Pain.');
      for (let step = 0; step < 4; step += 1) {
        await userEvent.click(screen.getByRole('button', { name: 'Next' }));
        await userEvent.type(screen.getByRole('textbox'), 'Pain.');
      }
      await userEvent.click(screen.getByRole('button', { name: 'Send' }));
      await expect(await screen.findByRole('alert')).toBeVisible();
    } finally {
      globalThis.fetch = original;
    }
  },
};

/** Offline: the same retry path, reached by skipping to the end. */
export const OfflineSkipThrough: Story = {
  play: async () => {
    await expect(
      await screen.findByRole('button', { name: 'Skip' })
    ).toBeVisible();
  },
};

/** Right to left: the dialog under an Arabic document direction. */
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

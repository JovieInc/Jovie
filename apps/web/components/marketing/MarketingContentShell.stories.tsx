import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingContentShell } from './MarketingContentShell';
import { MarketingPageShell } from './MarketingPageShell';

const meta = {
  title: 'Marketing/Primitives/MarketingContentShell',
  component: MarketingContentShell,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <MarketingPageShell className='bg-base text-primary-token'>
        <Story />
      </MarketingPageShell>
    ),
  ],
} satisfies Meta<typeof MarketingContentShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <MarketingContentShell>
      <h1 className='text-3xl font-semibold text-primary-token'>About Jovie</h1>
      <p className='mt-4'>
        Jovie is the release platform for independent artists. One adaptive
        profile keeps the next drop, the next fan, and the next action in the
        same reading surface.
      </p>
      <p className='mt-4'>
        Long-form marketing pages use this prose-width shell so about, support,
        and legal-style bodies share typography and vertical rhythm without a
        second page chrome.
      </p>
    </MarketingContentShell>
  ),
};

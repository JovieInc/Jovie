import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingSectionFrame } from './MarketingSectionFrame';

const meta = {
  title: 'Marketing/Primitives/MarketingSectionFrame',
  component: MarketingSectionFrame,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarketingSectionFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

function FrameCopy() {
  return (
    <div>
      <h2 className='marketing-h2-linear text-primary-token'>
        Your release work, connected.
      </h2>
      <p className='mt-4 max-w-[34rem] text-mid leading-[1.65] text-secondary-token'>
        Keep the next drop, the next fan, and the next action in one shared view
        instead of scattering them across tools.
      </p>
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <MarketingSectionFrame>
      <FrameCopy />
    </MarketingSectionFrame>
  ),
};

export const WithEyebrow: Story = {
  args: { eyebrow: 'Inside Jovie' },
  render: args => (
    <MarketingSectionFrame eyebrow={args.eyebrow}>
      <FrameCopy />
    </MarketingSectionFrame>
  ),
};

export const Reversed: Story = {
  args: { eyebrow: 'The platform', reverse: true },
  render: args => (
    <MarketingSectionFrame eyebrow={args.eyebrow} reverse={args.reverse}>
      <FrameCopy />
      <div className='rounded-2xl border border-subtle bg-surface-1 p-8 text-sm text-secondary-token'>
        Section frames can reverse the landing grid so copy and media trade
        sides without a new layout primitive.
      </div>
    </MarketingSectionFrame>
  ),
};
